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
                    currency="USD",
                    outbound=outbound,
                    source=Source.GOOGLE_FLIGHTS,
                )
                results.append(result)

            results.sort(key=lambda r: r.price)
            logger.info(f"Found {len(results)} flights via fast-flights")
            return results

        except Exception as e:
            logger.error(f"fast-flights search failed: {e}")
            return []

    async def _search_browser(self, request: SearchRequest) -> list[FlightResult]:
        """Fallback: scrape Google Flights using Patchright browser automation."""
        from airline_scraper.utils.browser import (
            create_browser,
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

        cabin_param = {
            CabinClass.ECONOMY: "1",
            CabinClass.PREMIUM_ECONOMY: "2",
            CabinClass.BUSINESS: "3",
            CabinClass.FIRST: "4",
        }
        url += f"&curr=USD"

        results = []

        try:
            async with create_browser(headless=headless) as (page, context):
                logger.info(f"Navigating to Google Flights: {url}")
                await page.goto(url, wait_until="domcontentloaded")
                await human_delay(3, 6)
                await human_scroll(page)
                await human_delay(2, 4)

                # Wait for flight results to load
                # Google Flights renders results in list items
                loaded = await wait_for_content(
                    page, "[data-result-index], .pIav2d, .Rk10dc", timeout=20000
                )

                if not loaded:
                    logger.warning("Could not load Google Flights results via browser")
                    # Take a screenshot for debugging
                    try:
                        os.makedirs("screenshots", exist_ok=True)
                        await page.screenshot(path="screenshots/google_flights_debug.png")
                        logger.info("Debug screenshot saved to screenshots/google_flights_debug.png")
                    except Exception:
                        pass
                    return []

                # Extract flight data from the page
                content = await page.content()

                # Try to extract prices from the rendered page
                price_elements = await page.query_selector_all(
                    "[data-result-index] .YMlIz, .pIav2d .YMlIz, .Rk10dc .YMlIz"
                )

                if not price_elements:
                    # Broader selector for prices
                    price_elements = await page.query_selector_all(
                        "span[data-gs], .BVAVmf"
                    )

                for el in price_elements[:20]:  # Limit to top 20
                    try:
                        text = await el.inner_text()
                        price_match = re.search(r"[\d,]+", text.replace(",", ""))
                        if price_match:
                            price_val = float(price_match.group().replace(",", ""))
                            if price_val > 10:  # Filter out noise
                                result = FlightResult(
                                    price=price_val,
                                    currency="USD",
                                    outbound=FlightLeg(
                                        departure_airport=request.origin,
                                        arrival_airport=request.destination,
                                    ),
                                    source=Source.GOOGLE_FLIGHTS,
                                    deep_link=page.url,
                                )
                                results.append(result)
                    except Exception as e:
                        logger.debug(f"Error extracting price element: {e}")
                        continue

        except Exception as e:
            logger.error(f"Browser-based Google Flights search failed: {e}")

        results.sort(key=lambda r: r.price)
        return results
