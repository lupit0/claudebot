"""Google Flights scraper using the fast-flights library.

fast-flights queries Google Flights using encoded Protobuf requests,
bypassing the need for browser automation entirely. This is the most
reliable and lightweight approach.

Falls back to browser-based scraping via Patchright if fast-flights fails.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime
from typing import Optional

from airline_scraper.models import (
    CabinClass,
    FlightLeg,
    FlightResult,
    SearchRequest,
    Source,
    TripType,
)
from airline_scraper.scrapers.base import BaseScraper
from airline_scraper.utils.links import google_flights_link

logger = logging.getLogger(__name__)

# Mapping from our CabinClass to fast-flights seat type
_CABIN_MAP = {
    CabinClass.ECONOMY: "economy",
    CabinClass.PREMIUM_ECONOMY: "premium-economy",
    CabinClass.BUSINESS: "business",
    CabinClass.FIRST: "first",
}

# Mapping for max stops filter
_STOPS_MAP = {
    0: "nonstop",  # Nonstop only
    1: "1-stop-or-fewer",
    2: "2-stops-or-fewer",
}


def _parse_duration(duration_str: str) -> Optional[int]:
    """Parse a duration string like '5h 30m' or '2 hr 15 min' into minutes."""
    if not duration_str:
        return None
    total = 0
    hours = re.search(r"(\d+)\s*h", duration_str)
    minutes = re.search(r"(\d+)\s*m", duration_str)
    if hours:
        total += int(hours.group(1)) * 60
    if minutes:
        total += int(minutes.group(1))
    return total if total > 0 else None


def _count_stops(stop_text: str) -> int:
    """Parse stop count from text like 'Nonstop', '1 stop', '2 stops'."""
    if not stop_text:
        return 0
    lower = stop_text.lower()
    if "nonstop" in lower or "direct" in lower:
        return 0
    match = re.search(r"(\d+)", lower)
    return int(match.group(1)) if match else 0


class GoogleFlightsScraper(BaseScraper):
    """Scrapes Google Flights using fast-flights (no browser needed)."""

    name = "google_flights"

    async def search(self, request: SearchRequest) -> list[FlightResult]:
        """Search Google Flights using the fast-flights library."""
        results = await self._search_fast_flights(request)
        if results:
            return results

        logger.info("fast-flights returned no results, trying browser fallback...")
        return await self._search_browser(request)

    async def _search_fast_flights(self, request: SearchRequest) -> list[FlightResult]:
        """Use the fast-flights library (lightweight, no browser)."""
        try:
            from fast_flights import FlightData, Passengers, create_filter
        except ImportError:
            logger.warning(
                "fast-flights not installed. Install with: pip install fast-flights"
            )
            return []

        try:
            trip_type = (
                "one-way"
                if request.trip_type == TripType.ONE_WAY
                else "round-trip"
            )

            filter_obj = create_filter(
                flight_data=[
                    FlightData(
                        date=request.departure_date.strftime("%Y-%m-%d"),
                        from_airport=request.origin,
                        to_airport=request.destination,
                    ),
                ]
                + (
                    [
                        FlightData(
                            date=request.return_date.strftime("%Y-%m-%d"),
                            from_airport=request.destination,
                            to_airport=request.origin,
                        ),
                    ]
                    if request.return_date and request.trip_type == TripType.ROUND_TRIP
                    else []
                ),
                trip=trip_type,
                seat=_CABIN_MAP.get(request.cabin_class, "economy"),
                passengers=Passengers(
                    adults=request.adults,
                    children=request.children,
                ),
            )

            # Apply max stops filter if specified
            if request.max_stops is not None and request.max_stops in _STOPS_MAP:
                filter_obj.max_stops = _STOPS_MAP[request.max_stops]

            # Execute the search
            from fast_flights import get_flights

            flight_results = get_flights(filter_obj)

            results = []
            if not flight_results or not flight_results.flights:
                logger.info("No flights found via fast-flights")
                return []

            for flight in flight_results.flights:
                price_val = None
                if hasattr(flight, "price") and flight.price:
                    price_str = str(flight.price)
                    # Extract numeric price from strings like "$234" or "USD 234"
                    price_match = re.search(r"[\d,]+\.?\d*", price_str.replace(",", ""))
                    if price_match:
                        price_val = float(price_match.group())

                if price_val is None:
                    continue

                # Build outbound leg
                outbound = FlightLeg(
                    departure_airport=request.origin,
                    arrival_airport=request.destination,
                    airline=getattr(flight, "name", "") or "",
                    duration_minutes=_parse_duration(
                        getattr(flight, "duration", "") or ""
                    ),
                    stops=_count_stops(getattr(flight, "stops", "") or ""),
                )

                # Parse departure/arrival times if available
                if hasattr(flight, "departure") and flight.departure:
                    try:
                        dep_str = str(flight.departure)
                        outbound.departure_time = datetime.strptime(
                            f"{request.departure_date} {dep_str}", "%Y-%m-%d %I:%M %p"
                        )
                    except (ValueError, TypeError):
                        pass

                if hasattr(flight, "arrival") and flight.arrival:
                    try:
                        arr_str = str(flight.arrival)
                        outbound.arrival_time = datetime.strptime(
                            f"{request.departure_date} {arr_str}", "%Y-%m-%d %I:%M %p"
                        )
                    except (ValueError, TypeError):
                        pass

                result = FlightResult(
                    price=price_val,
                    currency=request.currency,
                    outbound=outbound,
                    source=Source.GOOGLE_FLIGHTS,
                    deep_link=google_flights_link(request),
                )
                results.append(result)

            results.sort(key=lambda r: r.price)
            logger.info(f"Found {len(results)} flights via fast-flights")
            return results

        except Exception as e:
            logger.error(f"fast-flights search failed: {e}")
            return []

    async def _search_browser(self, request: SearchRequest) -> list[FlightResult]:
        """Fallback: scrape Google Flights using Patchright browser automation.

        Extracts full flight details: airline, departure/arrival times,
        duration, stops, and price from each flight result card.
        """
        from airline_scraper.utils.browser import (
            create_browser,
            dismiss_cookie_consent,
            human_delay,
            human_scroll,
            wait_for_content,
        )

        headless = os.getenv("HEADLESS", "true").lower() == "true"

        # Build the Google Flights URL
        dep_date = request.departure_date.strftime("%Y-%m-%d")
        url = (
            f"https://www.google.com/travel/flights?"
            f"q=flights+from+{request.origin}+to+{request.destination}"
            f"+on+{dep_date}"
        )
        if request.return_date:
            ret_date = request.return_date.strftime("%Y-%m-%d")
            url += f"+return+{ret_date}"

        url += f"&curr={request.currency}"

        # Add stops filter for Google Flights URL
        if request.max_stops is not None:
            url += f"&stops={request.max_stops}"

        results = []

        try:
            async with create_browser(headless=headless) as (page, context):
                logger.info(f"Navigating to Google Flights: {url}")
                await page.goto(url, wait_until="domcontentloaded")
                await human_delay(2, 4)

                # Dismiss cookie consent (Google shows this in EU regions)
                await dismiss_cookie_consent(page)
                await human_delay(1, 2)

                await human_scroll(page)
                await human_delay(2, 4)

                # If consent redirected us, navigate back to the flights page
                if "travel/flights" not in page.url:
                    logger.info("Re-navigating to Google Flights after consent...")
                    await page.goto(url, wait_until="domcontentloaded")
                    await human_delay(3, 5)
                    await dismiss_cookie_consent(page)
                    await human_delay(1, 2)

                # Wait for flight results to load
                loaded = await wait_for_content(
                    page,
                    "li[data-result-index], .pIav2d, .Rk10dc, [jsname='IWWIKb']",
                    timeout=20000,
                )

                if not loaded:
                    logger.warning("Could not load Google Flights results via browser")
                    try:
                        os.makedirs("screenshots", exist_ok=True)
                        await page.screenshot(path="screenshots/google_flights_debug.png")
                        logger.info("Debug screenshot saved")
                    except Exception:
                        pass
                    return []

                # Give results time to fully render (prices load asynchronously)
                await human_delay(2, 4)

                # Extract flight data using JavaScript for maximum reliability.
                # Google Flights renders flight rows in <li> with data-result-index
                # or within specific container divs. Each row contains times,
                # airline, duration, stops, and price as structured text.
                flight_data = await page.evaluate("""() => {
                    const flights = [];

                    // Strategy 1: li[data-result-index] — most common layout
                    let rows = document.querySelectorAll('li[data-result-index]');

                    // Strategy 2: .pIav2d result cards
                    if (!rows.length) {
                        rows = document.querySelectorAll('.pIav2d, .Rk10dc');
                    }

                    // Strategy 3: role=listitem within flights results
                    if (!rows.length) {
                        rows = document.querySelectorAll('[jsname="IWWIKb"] [role="listitem"]');
                    }

                    for (let i = 0; i < Math.min(rows.length, 25); i++) {
                        const row = rows[i];
                        const text = row.innerText || '';

                        // Skip if too short to be a real result
                        if (text.length < 20) continue;

                        flights.push({
                            text: text,
                            index: i
                        });
                    }

                    return flights;
                }""")

                if not flight_data:
                    logger.info("No flight rows found via JS, trying text extraction from full page")
                    # Last resort: get all page text and try to find flight-like blocks
                    page_text = await page.inner_text("body")
                    results = self._parse_flights_from_text(page_text, request)
                    if results:
                        return results

                    # Final fallback: just extract prices
                    return await self._extract_prices_only(page, request)

                deep_link = google_flights_link(request)

                for item in flight_data:
                    text = item.get("text", "")
                    parsed = self._parse_google_flight_card(text, request, deep_link)
                    if parsed:
                        results.append(parsed)

        except Exception as e:
            logger.error(f"Browser-based Google Flights search failed: {e}")

        results.sort(key=lambda r: r.price)
        return results

    def _parse_google_flight_card(
        self, card_text: str, request: SearchRequest, deep_link: str
    ) -> Optional[FlightResult]:
        """Parse a Google Flights result card's text into a FlightResult.

        Google Flights card text typically looks like:
            6:00 AM – 9:30 AM
            British Airways
            3 hr 30 min
            Nonstop
            LHR – BCN
            £85
        Or in 24h format:
            06:00 – 09:30
            ...
        """
        if not card_text or len(card_text) < 15:
            return None

        # Extract price — match any currency symbol + number
        price_match = re.search(r"[£$€¥₹]\s*([\d,]+(?:\.\d{2})?)", card_text)
        if not price_match:
            # Try plain number at the end of a line (sometimes price has no symbol)
            price_match = re.search(r"(?:^|\n)\s*([\d,]{2,})\s*(?:$|\n)", card_text)
        if not price_match:
            return None

        price = float(price_match.group(1).replace(",", ""))
        if price < 10:
            return None

        # Extract times — support both "6:00 AM – 9:30 PM" and "06:00 – 09:30" formats
        dep_time_dt = None
        arr_time_dt = None

        # 12-hour format: "6:00 AM – 9:30 PM" or "6:00 AM - 9:30 PM"
        time_12h = re.findall(r"(\d{1,2}:\d{2}\s*[AaPp][Mm])", card_text)
        if len(time_12h) >= 2:
            try:
                dep_time_dt = datetime.strptime(
                    f"{request.departure_date} {time_12h[0].strip()}",
                    "%Y-%m-%d %I:%M %p",
                )
                arr_time_dt = datetime.strptime(
                    f"{request.departure_date} {time_12h[1].strip()}",
                    "%Y-%m-%d %I:%M %p",
                )
            except (ValueError, TypeError):
                pass
        else:
            # 24-hour format: "06:00 – 09:30" or "06:00 - 09:30"
            time_24h = re.findall(r"(\d{1,2}:\d{2})(?!\s*[AaPp])", card_text)
            if len(time_24h) >= 2:
                try:
                    dep_time_dt = datetime.strptime(
                        f"{request.departure_date} {time_24h[0].strip()}",
                        "%Y-%m-%d %H:%M",
                    )
                    arr_time_dt = datetime.strptime(
                        f"{request.departure_date} {time_24h[1].strip()}",
                        "%Y-%m-%d %H:%M",
                    )
                except (ValueError, TypeError):
                    pass

        # Extract airline name
        airline = self._extract_airline(card_text)

        # Extract duration ("3 hr 30 min", "3h 30m", "5 hr", "3h30m")
        duration_minutes = None
        dur_match = re.search(
            r"(\d+)\s*(?:hr|h)\s*(?:(\d+)\s*(?:min|m))?", card_text, re.IGNORECASE
        )
        if dur_match:
            duration_minutes = int(dur_match.group(1)) * 60
            if dur_match.group(2):
                duration_minutes += int(dur_match.group(2))

        # Extract stops
        stops = 0
        if re.search(r"(?:nonstop|non-stop|direct)", card_text, re.IGNORECASE):
            stops = 0
        else:
            stop_match = re.search(r"(\d+)\s*stop", card_text, re.IGNORECASE)
            if stop_match:
                stops = int(stop_match.group(1))

        outbound = FlightLeg(
            departure_airport=request.origin,
            arrival_airport=request.destination,
            airline=airline,
            departure_time=dep_time_dt,
            arrival_time=arr_time_dt,
            duration_minutes=duration_minutes,
            stops=stops,
        )

        return FlightResult(
            price=price,
            currency=request.currency,
            outbound=outbound,
            source=Source.GOOGLE_FLIGHTS,
            deep_link=deep_link,
        )

    def _extract_airline(self, text: str) -> str:
        """Extract airline name from card text using word-boundary matching."""
        # Order matters: longer/more-specific names first to avoid partial matches
        # (e.g., "ANA" must not match as substring of "Ryanair")
        airlines = [
            "British Airways", "American Airlines", "Alaska Airlines",
            "Hawaiian Airlines", "Japan Airlines", "Turkish Airlines",
            "Singapore Airlines", "Brussels Airlines",
            "TAP Air Portugal", "TAP Portugal",
            "Air New Zealand", "Virgin Atlantic", "Virgin Australia",
            "Air France", "Air Canada", "Air China", "Air Europa",
            "Royal Air Maroc", "China Eastern", "China Southern",
            "Garuda Indonesia", "Philippine Airlines",
            "Vietnam Airlines", "Thai Airways",
            "Qatar Airways", "Cathay Pacific", "Korean Air",
            "Kenya Airways",
            "Lufthansa", "Emirates", "Ryanair", "easyJet",
            "Wizz Air", "Vueling", "Norwegian", "Finnair", "Swiss",
            "Austrian", "Aegean", "Czech Airlines",
            "Iberia", "Aer Lingus",
            "Southwest", "JetBlue", "Frontier",
            "WestJet", "LATAM", "Avianca", "Volaris",
            "Qantas", "Etihad", "Oman Air", "Gulf Air", "Saudia",
            "EgyptAir", "ITA Airways", "Transavia",
            "Eurowings", "Condor",
            "Multiple airlines",
            # Short names last — use word boundary to avoid substring matches
            "KLM", "ANA", "JAL", "SAS", "LOT", "TUI",
            "United", "Delta", "American", "Alaska",
            "Spirit", "Copa",
        ]
        text_lower = text.lower()
        for airline in airlines:
            # Use word-boundary matching for short names (<=4 chars)
            # to avoid false positives like "ANA" in "Ryanair"
            if len(airline) <= 4:
                if re.search(r"(?<![a-zA-Z])" + re.escape(airline) + r"(?![a-zA-Z])", text, re.IGNORECASE):
                    return airline
            else:
                if airline.lower() in text_lower:
                    return airline
        # Try to extract any capitalized multi-word name that looks like an airline
        airline_match = re.search(
            r"(?:^|\n)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s*(?:$|\n)", text
        )
        if airline_match:
            candidate = airline_match.group(1).strip()
            if candidate.lower() not in {
                "nonstop", "round trip", "one way", "economy",
                "business", "first", "premium economy",
            }:
                return candidate
        return ""

    def _parse_flights_from_text(
        self, page_text: str, request: SearchRequest
    ) -> list[FlightResult]:
        """Try to parse flights from full page text when structured extraction fails."""
        results = []
        deep_link = google_flights_link(request)

        # Split page text into potential flight blocks
        # Look for time patterns as block delimiters
        blocks = re.split(r"(?=\d{1,2}:\d{2}\s*(?:[AaPp][Mm])?\s*[–\-]\s*\d{1,2}:\d{2})", page_text)

        for block in blocks:
            if len(block) < 20:
                continue
            parsed = self._parse_google_flight_card(block[:500], request, deep_link)
            if parsed:
                results.append(parsed)
            if len(results) >= 20:
                break

        return results

    async def _extract_prices_only(
        self, page, request: SearchRequest
    ) -> list[FlightResult]:
        """Last-resort extraction: just get prices with no other details."""
        results = []
        price_elements = await page.query_selector_all(
            "[data-result-index] .YMlIz, .pIav2d .YMlIz, .Rk10dc .YMlIz, "
            "span[data-gs], .BVAVmf"
        )

        for el in price_elements[:20]:
            try:
                text = await el.inner_text()
                price_match = re.search(r"[\d,]+", text.replace(",", ""))
                if price_match:
                    price_val = float(price_match.group().replace(",", ""))
                    if price_val > 10:
                        result = FlightResult(
                            price=price_val,
                            currency=request.currency,
                            outbound=FlightLeg(
                                departure_airport=request.origin,
                                arrival_airport=request.destination,
                            ),
                            source=Source.GOOGLE_FLIGHTS,
                            deep_link=google_flights_link(request),
                        )
                        results.append(result)
            except Exception as e:
                logger.debug(f"Error extracting price element: {e}")
                continue

        return results
