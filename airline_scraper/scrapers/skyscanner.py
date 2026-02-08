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

        if request.trip_type == TripType.ROUND_TRIP and request.return_date:
            ret_date = request.return_date.strftime("%y%m%d")
            url = (
                f"https://www.skyscanner.com/transport/flights/"
                f"{request.origin.lower()}/{request.destination.lower()}/"
                f"{dep_date}/{ret_date}/"
                f"?adultsv2={request.adults}"
                f"&cabinclass={cabin}"
                f"&childrenv2=" + "%7C".join(["8"] * request.children)
                if request.children
                else f"https://www.skyscanner.com/transport/flights/"
                f"{request.origin.lower()}/{request.destination.lower()}/"
                f"{dep_date}/{ret_date}/"
                f"?adultsv2={request.adults}"
                f"&cabinclass={cabin}"
            )
        else:
            url = (
                f"https://www.skyscanner.com/transport/flights/"
                f"{request.origin.lower()}/{request.destination.lower()}/"
                f"{dep_date}/"
                f"?adultsv2={request.adults}"
                f"&cabinclass={cabin}"
                f"&rtn=0"
            )

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

                # Extract flight data
                content = await page.content()
                results = self._parse_results_from_html(content, request)

                if not results:
                    # Try extracting via element selectors
                    results = await self._extract_via_selectors(page, request)

        except Exception as e:
            logger.error(f"Skyscanner search failed: {e}")

        results.sort(key=lambda r: r.price)
        return results

    def _parse_results_from_html(
        self, html: str, request: SearchRequest
    ) -> list[FlightResult]:
        """Parse flight results from the raw HTML."""
        try:
            from bs4 import BeautifulSoup
        except ImportError:
            logger.warning("beautifulsoup4 not installed")
            return []

        soup = BeautifulSoup(html, "lxml")
        results = []

        # Look for price elements in various Skyscanner layouts
        price_elements = soup.find_all(
            string=re.compile(r"[\$€£]\s*\d+")
        )

        seen_prices = set()
        for el in price_elements[:30]:
            text = str(el).strip()
            price_match = re.search(r"[\$€£]\s*([\d,]+)", text)
            if not price_match:
                continue

            price = float(price_match.group(1).replace(",", ""))
            if price < 20 or price in seen_prices:
                continue
            seen_prices.add(price)

            # Determine currency
            currency = "USD"
            if "€" in text:
                currency = "EUR"
            elif "£" in text:
                currency = "GBP"

            result = FlightResult(
                price=price,
                currency=currency,
                outbound=FlightLeg(
                    departure_airport=request.origin,
                    arrival_airport=request.destination,
                ),
                source=Source.SKYSCANNER,
            )
            results.append(result)

        return results

    async def _extract_via_selectors(
        self, page, request: SearchRequest
    ) -> list[FlightResult]:
        """Try to extract results using page selectors."""
        results = []

        # Various Skyscanner selectors for prices
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
                        currency="USD",
                        outbound=FlightLeg(
                            departure_airport=request.origin,
                            arrival_airport=request.destination,
                        ),
                        source=Source.SKYSCANNER,
                        deep_link=page.url,
                    )
                    results.append(result)
                except Exception:
                    continue

            if results:
                break

        return results
