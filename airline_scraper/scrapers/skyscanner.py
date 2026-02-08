"""Skyscanner scraper using Patchright browser automation.

Skyscanner has moderate anti-bot protection. This scraper navigates the
search flow naturally to avoid detection.
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
from airline_scraper.utils.airports import validate_stops
from airline_scraper.utils.links import skyscanner_link
from airline_scraper.utils.browser import (
    create_browser,
    dismiss_cookie_consent,
    human_delay,
    human_scroll,
    wait_for_content,
)

logger = logging.getLogger(__name__)

_CABIN_MAP = {
    CabinClass.ECONOMY: "economy",
    CabinClass.PREMIUM_ECONOMY: "premiumeconomy",
    CabinClass.BUSINESS: "business",
    CabinClass.FIRST: "first",
}


class SkyscannerScraper(BaseScraper):
    """Scrapes Skyscanner using browser automation with anti-detection."""

    name = "skyscanner"

    async def search(self, request: SearchRequest) -> list[FlightResult]:
        """Search Skyscanner for flights."""
        headless = os.getenv("HEADLESS", "true").lower() == "true"

        # Build Skyscanner URL
        dep_date = request.departure_date.strftime("%y%m%d")
        cabin = _CABIN_MAP.get(request.cabin_class, "economy")

        currency_lower = request.currency.lower()

        if request.trip_type == TripType.ROUND_TRIP and request.return_date:
            ret_date = request.return_date.strftime("%y%m%d")
            base_url = (
                f"https://www.skyscanner.com/transport/flights/"
                f"{request.origin.lower()}/{request.destination.lower()}/"
                f"{dep_date}/{ret_date}/"
                f"?adultsv2={request.adults}"
                f"&cabinclass={cabin}"
                f"&currency={currency_lower}"
            )
            if request.children:
                url = base_url + "&childrenv2=" + "%7C".join(["8"] * request.children)
            else:
                url = base_url
        else:
            url = (
                f"https://www.skyscanner.com/transport/flights/"
                f"{request.origin.lower()}/{request.destination.lower()}/"
                f"{dep_date}/"
                f"?adultsv2={request.adults}"
                f"&cabinclass={cabin}"
                f"&currency={currency_lower}"
                f"&rtn=0"
            )

        # Add stops filter if specified
        if request.max_stops is not None:
            if request.max_stops == 0:
                url += "&stops=direct"
            elif request.max_stops == 1:
                url += "&stops=!twoPlusStops"

        results = []

        try:
            async with create_browser(headless=headless) as (page, context):
                logger.info(f"Navigating to Skyscanner: {url}")
                await page.goto(url, wait_until="domcontentloaded")
                await human_delay(4, 7)

                # Dismiss cookie consent if present
                await dismiss_cookie_consent(page)
                await human_delay(1, 2)

                await human_scroll(page)
                await human_delay(3, 5)

                # Wait for flight results
                loaded = await wait_for_content(
                    page,
                    "[class*='FlightsResults'], [class*='ItineraryList'], "
                    "[class*='resultItem']",
                    timeout=30000,
                )

                if not loaded:
                    logger.warning("Could not load Skyscanner results")
                    try:
                        os.makedirs("screenshots", exist_ok=True)
                        await page.screenshot(
                            path="screenshots/skyscanner_debug.png"
                        )
                    except Exception:
                        pass
                    return []

                # Let prices settle (Skyscanner progressively loads results)
                await human_delay(5, 8)
                await human_scroll(page, distance=500)
                await human_delay(2, 3)

                # Extract flight data using JavaScript to get structured
                # card text from each flight result row
                flight_data = await page.evaluate("""() => {
                    const flights = [];

                    // Skyscanner result cards — try multiple selector strategies
                    let rows = document.querySelectorAll(
                        '[class*="ItineraryList"] [class*="ItineraryCard"], ' +
                        '[class*="FlightsResults"] [class*="resultItem"], ' +
                        '[data-testid*="itinerary"], ' +
                        '[class*="EcoTicketWrapper"]'
                    );

                    // Broader fallback
                    if (!rows.length) {
                        rows = document.querySelectorAll(
                            'a[href*="booking"], ' +
                            'div[class*="flight"], ' +
                            '[role="listitem"]'
                        );
                    }

                    for (let i = 0; i < Math.min(rows.length, 25); i++) {
                        const row = rows[i];
                        const text = (row.innerText || '').trim();

                        // Must have enough text to be a real result
                        if (text.length < 15) continue;

                        // Must contain a price-like pattern
                        if (!/[\d,]{2,}/.test(text)) continue;

                        flights.push({ text: text, index: i });
                    }

                    return flights;
                }""")

                deep_link = skyscanner_link(request)

                if flight_data:
                    for item in flight_data:
                        parsed = self._parse_skyscanner_card(
                            item.get("text", ""), request, deep_link
                        )
                        if parsed:
                            results.append(parsed)

                if not results:
                    # Fallback: try HTML parsing for prices + details
                    content = await page.content()
                    results = self._parse_results_from_html(content, request)

                if not results:
                    # Last resort: extract prices only via selectors
                    results = await self._extract_prices_only(page, request)

        except Exception as e:
            logger.error(f"Skyscanner search failed: {e}")

        results.sort(key=lambda r: r.price)
        return results

    def _parse_skyscanner_card(
        self, card_text: str, request: SearchRequest, deep_link: str
    ) -> Optional[FlightResult]:
        """Parse a Skyscanner result card's text into a FlightResult.

        Skyscanner card text typically contains:
            06:00 - 09:30
            British Airways   Direct
            3h 30m
            LHR - BCN
            £85
        """
        if not card_text or len(card_text) < 15:
            return None

        # Extract price
        price_match = re.search(r"[£$€¥₹]\s*([\d,]+(?:\.\d{2})?)", card_text)
        if not price_match:
            price_match = re.search(r"[A-Z]{3}\s*([\d,]+)", card_text)
        if not price_match:
            return None

        price = float(price_match.group(1).replace(",", ""))
        if price < 10:
            return None

        # Extract times
        dep_time_dt = None
        arr_time_dt = None

        # 12-hour format
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
            # 24-hour format: "06:00 - 09:30"
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

        # Extract airline
        airline = self._extract_airline(card_text)

        # Extract duration
        duration_minutes = None
        dur_match = re.search(
            r"(\d+)\s*(?:hr|h)\s*(?:(\d+)\s*(?:min|m))?", card_text, re.IGNORECASE
        )
        if dur_match:
            duration_minutes = int(dur_match.group(1)) * 60
            if dur_match.group(2):
                duration_minutes += int(dur_match.group(2))

        # Extract stops — check for explicit stop count FIRST
        stops = 0
        stop_match = re.search(r"(\d+)\s*stop", card_text, re.IGNORECASE)
        if stop_match:
            stops = int(stop_match.group(1))
        elif re.search(r"(?:nonstop|non-stop|direct)", card_text, re.IGNORECASE):
            stops = 0

        # Validate stops against route distance
        stops = validate_stops(stops, duration_minutes, request.origin, request.destination)

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
            source=Source.SKYSCANNER,
            deep_link=deep_link,
        )

    def _extract_airline(self, text: str) -> str:
        """Extract airline name from card text using word-boundary matching."""
        # Order matters: longer/more-specific names first to avoid partial matches
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
            # Short names last with word-boundary matching
            "KLM", "ANA", "JAL", "SAS", "LOT", "TUI",
            "United", "Delta", "American", "Alaska",
            "Spirit", "Copa",
        ]
        text_lower = text.lower()
        for airline in airlines:
            if len(airline) <= 4:
                if re.search(r"(?<![a-zA-Z])" + re.escape(airline) + r"(?![a-zA-Z])", text, re.IGNORECASE):
                    return airline
            else:
                if airline.lower() in text_lower:
                    return airline
        return ""

    def _parse_results_from_html(
        self, html: str, request: SearchRequest
    ) -> list[FlightResult]:
        """Parse flight results from the raw HTML using BeautifulSoup."""
        try:
            from bs4 import BeautifulSoup
        except ImportError:
            logger.warning("beautifulsoup4 not installed")
            return []

        soup = BeautifulSoup(html, "lxml")
        results = []
        deep_link = skyscanner_link(request)

        # Find itinerary/result containers in the HTML
        # Try to get structured blocks rather than just price elements
        containers = soup.select(
            '[class*="ItineraryCard"], [class*="resultItem"], '
            '[data-testid*="itinerary"], [class*="EcoTicketWrapper"]'
        )

        if containers:
            for container in containers[:25]:
                text = container.get_text(separator="\n", strip=True)
                parsed = self._parse_skyscanner_card(text, request, deep_link)
                if parsed:
                    results.append(parsed)
            if results:
                return results

        # Fallback: just find prices in the raw HTML
        price_elements = soup.find_all(
            string=re.compile(r"[\$€£¥₹]\s*\d+|[A-Z]{3}\s*\d+")
        )

        seen_prices = set()
        for el in price_elements[:30]:
            text = str(el).strip()
            price_match = re.search(r"[\$€£¥₹]\s*([\d,]+)", text)
            if not price_match:
                price_match = re.search(r"[A-Z]{3}\s*([\d,]+)", text)
            if not price_match:
                continue

            price = float(price_match.group(1).replace(",", ""))
            if price < 20 or price in seen_prices:
                continue
            seen_prices.add(price)

            result = FlightResult(
                price=price,
                currency=request.currency,
                outbound=FlightLeg(
                    departure_airport=request.origin,
                    arrival_airport=request.destination,
                ),
                source=Source.SKYSCANNER,
                deep_link=deep_link,
            )
            results.append(result)

        return results

    async def _extract_prices_only(
        self, page, request: SearchRequest
    ) -> list[FlightResult]:
        """Last-resort extraction: just get prices."""
        results = []
        deep_link = skyscanner_link(request)

        selectors = [
            "[class*='Price'] span",
            "[class*='price'] span",
            "[data-testid*='price']",
            "span[class*='fqs-price']",
        ]

        for selector in selectors:
            elements = await page.query_selector_all(selector)
            if not elements:
                continue

            for el in elements[:20]:
                try:
                    text = await el.inner_text()
                    price_match = re.search(r"[\d,]+", text)
                    if not price_match:
                        continue
                    price = float(price_match.group().replace(",", ""))
                    if price < 20:
                        continue

                    result = FlightResult(
                        price=price,
                        currency=request.currency,
                        outbound=FlightLeg(
                            departure_airport=request.origin,
                            arrival_airport=request.destination,
                        ),
                        source=Source.SKYSCANNER,
                        deep_link=deep_link,
                    )
                    results.append(result)
                except Exception:
                    continue

            if results:
                break

        return results
