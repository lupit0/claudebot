"""Ryanair scraper using their public fare finder API.

Ryanair exposes a fare finder API at services-api.ryanair.com that works
with plain HTTP requests — no browser, no CAPTCHA, no Cloudflare bypass
needed. This gives us reliable access to Ryanair prices and schedules.

Endpoints used:
- farfnd/v4/oneWayFares: one-way flight prices
- farfnd/v4/roundTripFares: round-trip flight prices
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

import httpx

from airline_scraper.models import (
    FlightLeg,
    FlightResult,
    SearchRequest,
    Source,
    TripType,
)
from airline_scraper.scrapers.base import BaseScraper

logger = logging.getLogger(__name__)

_BASE_URL = "https://www.ryanair.com/api/farfnd/v4"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Accept-Language": "en-GB,en;q=0.9",
}

# Ryanair-operated airports — used to check if a route might be served
RYANAIR_HUBS = {
    "STN", "LTN", "LGW", "BHX", "BRS", "EDI", "GLA", "MAN", "LPL", "EMA",
    "EXT", "NCL", "ABZ", "PIK", "BFS", "SNN", "NOC", "KIR", "ORK", "DUB",
    "BGY", "CIA", "FCO", "NAP", "PSA", "BLQ", "TSF", "VRN", "CTA", "PMO",
    "BRI", "SUF", "TPS", "AHO", "CAG", "OLB", "GOA", "TRN", "PMF", "CUF",
    "BCN", "MAD", "AGP", "ALC", "VLC", "PMI", "IBZ", "TFS", "LPA", "ACE",
    "FUE", "SCQ", "SVQ", "BIO", "SDR", "GRO", "REU", "ZAZ", "VLL", "XRY",
    "MJV", "RMU", "OVD", "VGO", "LEI",
    "CGN", "FRA", "HHN", "BER", "SXF", "DUS", "HAM", "STR", "NUE", "MEM",
    "BRU", "CRL", "AMS", "EIN", "RTM",
    "LIS", "OPO", "FAO", "FNC",
    "ATH", "SKG", "CFU", "CHQ", "RHO", "KGS", "ZTH", "JMK", "JTR",
    "WAW", "WRO", "KRK", "GDN", "KTW", "POZ", "RZE", "BZG", "LUZ",
    "BUD", "PRG", "BTS", "VNO", "KUN", "RIX", "TLL",
    "OSL", "BGO", "TRD", "SVG", "TRF",
    "ARN", "GOT", "MMX", "NYO",
    "CPH", "AAL", "BLL",
    "HEL", "TMP", "TKU", "OUL", "LPP",
    "SOF", "VAR", "BOJ",
    "OTP", "CLJ", "TSR", "IAS", "SBZ", "CRA",
    "ZAG", "SPU", "DBV", "ZAD", "PUY", "RJK",
    "TGD", "TIV",
    "BEG", "NIS",
    "TIA",
    "SKP",
    "MLA",
    "LCA", "PFO",
    "TLV",
    "AMM",
    "RAK", "FEZ", "AGA", "TNG", "NDR", "OJU", "ESU",
}


def _is_ryanair_route(origin: str, destination: str) -> bool:
    """Quick check if Ryanair might fly between these airports."""
    return origin.upper() in RYANAIR_HUBS or destination.upper() in RYANAIR_HUBS


class RyanairScraper(BaseScraper):
    """Scrapes Ryanair prices via their public fare finder API.

    No browser needed — plain HTTP requests. Works even when Google Flights,
    Kayak, and Skyscanner are CAPTCHA-blocked.
    """

    name = "ryanair"

    async def search(self, request: SearchRequest) -> list[FlightResult]:
        """Search Ryanair for flights on the given route and date."""
        # Quick check — skip if neither airport is a Ryanair hub
        if not _is_ryanair_route(request.origin, request.destination):
            logger.debug(
                f"Skipping Ryanair: neither {request.origin} nor "
                f"{request.destination} is a known Ryanair airport"
            )
            return []

        if request.trip_type == TripType.ROUND_TRIP and request.return_date:
            return await self._search_round_trip(request)
        return await self._search_one_way(request)

    async def _search_one_way(self, request: SearchRequest) -> list[FlightResult]:
        """Search one-way fares via the farfnd API."""
        dep_date = request.departure_date.strftime("%Y-%m-%d")
        url = (
            f"{_BASE_URL}/oneWayFares/{request.origin}/{request.destination}"
            f"/cheapestPerDay?outboundMonthOfDate={dep_date[:7]}-01"
        )

        results = []
        try:
            async with httpx.AsyncClient(headers=_HEADERS, timeout=30) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()

                fares = data.get("outbound", {}).get("fares", [])
                if not fares:
                    fares = data.get("fares", [])

                for fare in fares:
                    result = self._parse_fare(fare, request, is_outbound=True)
                    if result:
                        # Only include fares matching the requested date
                        if result.outbound and result.outbound.departure_time:
                            if result.outbound.departure_time.date() == request.departure_date:
                                results.append(result)

                # If cheapestPerDay didn't give exact-date results, try the
                # general oneWayFares endpoint with date filtering
                if not results:
                    results = await self._search_one_way_general(request, client)

                if not results:
                    logger.info(
                        f"Ryanair: no flights {request.origin}→{request.destination} "
                        f"on {dep_date} (route may not operate daily)"
                    )

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.debug(f"Ryanair: no route {request.origin}→{request.destination}")
            else:
                logger.warning(f"Ryanair API error: {e.response.status_code}")
        except Exception as e:
            logger.warning(f"Ryanair search failed: {e}")

        results.sort(key=lambda r: r.price)
        return results

    async def _search_one_way_general(
        self, request: SearchRequest, client: httpx.AsyncClient
    ) -> list[FlightResult]:
        """Search using the general oneWayFares endpoint with date range."""
        dep_date = request.departure_date.strftime("%Y-%m-%d")
        params = {
            "departureAirportIataCode": request.origin,
            "arrivalAirportIataCode": request.destination,
            "outboundDepartureDateFrom": dep_date,
            "outboundDepartureDateTo": dep_date,
            "currency": request.currency,
            "adultPaxCount": str(request.adults),
            "market": "en-gb",
            "limit": "20",
            "offset": "0",
        }
        url = f"https://services-api.ryanair.com/farfnd/v4/oneWayFares"

        results = []
        try:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

            fares = data.get("fares", [])
            for fare_item in fares:
                outbound_data = fare_item.get("outbound", {})
                result = self._parse_general_fare(outbound_data, request)
                if result:
                    results.append(result)

        except Exception as e:
            logger.debug(f"Ryanair general API failed: {e}")

        return results

    async def _search_round_trip(self, request: SearchRequest) -> list[FlightResult]:
        """Search round-trip fares."""
        dep_date = request.departure_date.strftime("%Y-%m-%d")
        ret_date = request.return_date.strftime("%Y-%m-%d")

        params = {
            "departureAirportIataCode": request.origin,
            "arrivalAirportIataCode": request.destination,
            "outboundDepartureDateFrom": dep_date,
            "outboundDepartureDateTo": dep_date,
            "inboundDepartureDateFrom": ret_date,
            "inboundDepartureDateTo": ret_date,
            "currency": request.currency,
            "adultPaxCount": str(request.adults),
            "market": "en-gb",
            "limit": "20",
            "offset": "0",
        }
        url = f"https://services-api.ryanair.com/farfnd/v4/roundTripFares"

        results = []
        try:
            async with httpx.AsyncClient(headers=_HEADERS, timeout=30) as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()

                fares = data.get("fares", [])
                for fare_item in fares:
                    result = self._parse_round_trip_fare(fare_item, request)
                    if result:
                        results.append(result)

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.debug(f"Ryanair: no route {request.origin}→{request.destination}")
            else:
                logger.warning(f"Ryanair round-trip API error: {e.response.status_code}")
        except Exception as e:
            logger.warning(f"Ryanair round-trip search failed: {e}")

        results.sort(key=lambda r: r.price)
        return results

    def _parse_fare(
        self, fare: dict, request: SearchRequest, is_outbound: bool = True
    ) -> Optional[FlightResult]:
        """Parse a fare from the cheapestPerDay endpoint."""
        try:
            price_data = fare.get("price", {})
            if not price_data:
                price_data = fare.get("summary", {}).get("price", {})

            price = price_data.get("value")
            if price is None or price <= 0:
                return None

            currency = price_data.get("currencyCode", request.currency)

            dep_str = fare.get("departureDate", "")
            arr_str = fare.get("arrivalDate", "")

            dep_time = None
            arr_time = None
            if dep_str:
                dep_time = datetime.fromisoformat(dep_str.replace("Z", ""))
            if arr_str:
                arr_time = datetime.fromisoformat(arr_str.replace("Z", ""))

            duration_minutes = None
            if dep_time and arr_time:
                delta = arr_time - dep_time
                duration_minutes = int(delta.total_seconds() / 60)

            flight_number = fare.get("flightNumber", "")

            dep_airport = request.origin
            arr_airport = request.destination

            # Try to get airport info from nested objects
            dep_info = fare.get("departureAirport", {})
            arr_info = fare.get("arrivalAirport", {})
            if dep_info:
                dep_airport = dep_info.get("iataCode", request.origin)
            if arr_info:
                arr_airport = arr_info.get("iataCode", request.destination)

            outbound = FlightLeg(
                departure_airport=dep_airport,
                arrival_airport=arr_airport,
                departure_time=dep_time,
                arrival_time=arr_time,
                airline="Ryanair",
                flight_number=flight_number,
                duration_minutes=duration_minutes,
                stops=0,  # Ryanair only operates direct flights
            )

            deep_link = ryanair_link(request)

            return FlightResult(
                price=price,
                currency=currency,
                outbound=outbound,
                source=Source.RYANAIR,
                deep_link=deep_link,
            )
        except Exception as e:
            logger.debug(f"Error parsing Ryanair fare: {e}")
            return None

    def _parse_general_fare(
        self, outbound_data: dict, request: SearchRequest
    ) -> Optional[FlightResult]:
        """Parse a fare from the general oneWayFares/roundTripFares endpoint."""
        try:
            dep_airport_info = outbound_data.get("departureAirport", {})
            arr_airport_info = outbound_data.get("arrivalAirport", {})

            dep_str = outbound_data.get("departureDate", "")
            arr_str = outbound_data.get("arrivalDate", "")

            price_data = outbound_data.get("price", {})
            price = price_data.get("value")
            if price is None or price <= 0:
                return None

            currency = price_data.get("currencyCode", request.currency)
            flight_number = outbound_data.get("flightNumber", "")

            dep_time = None
            arr_time = None
            if dep_str:
                dep_time = datetime.fromisoformat(dep_str.replace("Z", ""))
            if arr_str:
                arr_time = datetime.fromisoformat(arr_str.replace("Z", ""))

            duration_minutes = None
            if dep_time and arr_time:
                delta = arr_time - dep_time
                duration_minutes = int(delta.total_seconds() / 60)

            outbound = FlightLeg(
                departure_airport=dep_airport_info.get("iataCode", request.origin),
                arrival_airport=arr_airport_info.get("iataCode", request.destination),
                departure_time=dep_time,
                arrival_time=arr_time,
                airline="Ryanair",
                flight_number=flight_number,
                duration_minutes=duration_minutes,
                stops=0,
            )

            return FlightResult(
                price=price,
                currency=currency,
                outbound=outbound,
                source=Source.RYANAIR,
                deep_link=ryanair_link(request),
            )
        except Exception as e:
            logger.debug(f"Error parsing Ryanair general fare: {e}")
            return None

    def _parse_round_trip_fare(
        self, fare_item: dict, request: SearchRequest
    ) -> Optional[FlightResult]:
        """Parse a round-trip fare."""
        try:
            outbound_data = fare_item.get("outbound", {})
            inbound_data = fare_item.get("inbound", {})
            summary = fare_item.get("summary", {})

            # Total price from summary
            total_price_data = summary.get("price", {})
            total_price = total_price_data.get("value")
            if total_price is None or total_price <= 0:
                return None

            currency = total_price_data.get("currencyCode", request.currency)

            # Parse outbound leg
            outbound = self._parse_leg(outbound_data, request.origin, request.destination)

            # Parse return leg
            return_leg = self._parse_leg(inbound_data, request.destination, request.origin)

            return FlightResult(
                price=total_price,
                currency=currency,
                outbound=outbound,
                return_leg=return_leg,
                source=Source.RYANAIR,
                deep_link=ryanair_link(request),
            )
        except Exception as e:
            logger.debug(f"Error parsing Ryanair round-trip fare: {e}")
            return None

    def _parse_leg(
        self, leg_data: dict, default_origin: str, default_dest: str
    ) -> FlightLeg:
        """Parse a single flight leg from API data."""
        dep_airport_info = leg_data.get("departureAirport", {})
        arr_airport_info = leg_data.get("arrivalAirport", {})

        dep_str = leg_data.get("departureDate", "")
        arr_str = leg_data.get("arrivalDate", "")

        dep_time = None
        arr_time = None
        if dep_str:
            dep_time = datetime.fromisoformat(dep_str.replace("Z", ""))
        if arr_str:
            arr_time = datetime.fromisoformat(arr_str.replace("Z", ""))

        duration_minutes = None
        if dep_time and arr_time:
            delta = arr_time - dep_time
            duration_minutes = int(delta.total_seconds() / 60)

        return FlightLeg(
            departure_airport=dep_airport_info.get("iataCode", default_origin),
            arrival_airport=arr_airport_info.get("iataCode", default_dest),
            departure_time=dep_time,
            arrival_time=arr_time,
            airline="Ryanair",
            flight_number=leg_data.get("flightNumber", ""),
            duration_minutes=duration_minutes,
            stops=0,
        )


def ryanair_link(request: SearchRequest) -> str:
    """Generate a Ryanair booking link."""
    dep = request.departure_date.strftime("%Y-%m-%d")
    url = (
        f"https://www.ryanair.com/gb/en/trip/flights/select"
        f"?adults={request.adults}"
        f"&teens=0"
        f"&children={request.children}"
        f"&infants=0"
        f"&dateOut={dep}"
        f"&isConnectedFlight=false"
        f"&isReturn={'true' if request.return_date else 'false'}"
        f"&discount=0"
        f"&originIata={request.origin}"
        f"&destinationIata={request.destination}"
        f"&tpAdults={request.adults}"
        f"&tpTeens=0"
        f"&tpChildren={request.children}"
        f"&tpInfants=0"
        f"&tpStartDate={dep}"
        f"&tpDiscount=0"
        f"&tpIs498=false"
    )
    if request.return_date:
        ret = request.return_date.strftime("%Y-%m-%d")
        url += f"&dateIn={ret}&tpEndDate={ret}"

    return url
