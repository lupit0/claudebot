"""Kayak scraper using Patchright browser automation.

Kayak uses DataDome for anti-bot protection, making it one of the harder
sites to scrape. This scraper uses several strategies:

1. Patchright (undetected Playwright) to avoid automation detection
2. Human-like behavior (delays, scrolling, mouse movement)
3. Residential proxy support for IP reputation
4. Cookie persistence to reuse solved challenges
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
    human_delay,
    human_scroll,
    wait_for_content,
)

logger = logging.getLogger(__name__)

_CABIN_MAP = {
    CabinClass.ECONOMY: "e",
    CabinClass.PREMIUM_ECONOMY: "p",
    CabinClass.BUSINESS: "b",
    CabinClass.FIRST: "f",
}


class KayakScraper(BaseScraper):
    """Scrapes Kayak using browser automation with anti-detection."""

    name = "kayak"

    def __init__(self, persistent_dir: Optional[str] = None):
        # Use a persistent browser profile to keep DataDome cookies
        self.persistent_dir = persistent_dir or os.path.join(
            os.path.expanduser("~"), ".airline_scraper", "kayak_profile"
        )
        os.makedirs(self.persistent_dir, exist_ok=True)

    async def search(self, request: SearchRequest) -> list[FlightResult]:
        """Search Kayak for flights."""
        headless = os.getenv("HEADLESS", "true").lower() == "true"

        # Build Kayak search URL
        dep_date = request.departure_date.strftime("%Y-%m-%d")
        cabin = _CABIN_MAP.get(request.cabin_class, "e")

        if request.trip_type == TripType.ROUND_TRIP and request.return_date:
            ret_date = request.return_date.strftime("%Y-%m-%d")
            url = (
                f"https://www.kayak.com/flights/"
                f"{request.origin}-{request.destination}/"
                f"{dep_date}/{ret_date}"
                f"?sort=price_a&fs=cabin={cabin}"
            )
        else:
            url = (
                f"https://www.kayak.com/flights/"
                f"{request.origin}-{request.destination}/"
                f"{dep_date}"
                f"?sort=price_a&fs=cabin={cabin}"
            )

        if request.max_stops is not None:
            url += f";stops={request.max_stops}"

        results = []

        try:
            async with create_browser(
                headless=headless,
                persistent_context_dir=self.persistent_dir,
            ) as (page, context):
                # First navigate to Kayak homepage to establish cookies
                logger.info("Visiting Kayak homepage first for cookie establishment...")
                await page.goto("https://www.kayak.com", wait_until="domcontentloaded")
                await human_delay(3, 6)

                # Dismiss any cookie consent dialogs
                try:
                    consent_btn = page.locator(
                        "button:has-text('Accept'), button:has-text('OK'), "
                        "button:has-text('Agree'), .dCnC-mod-close"
                    )
                    if await consent_btn.count() > 0:
                        await consent_btn.first.click()
                        await human_delay(1, 2)
                except Exception:
                    pass

                # Now navigate to the search URL
                logger.info(f"Navigating to Kayak search: {url}")
                await page.goto(url, wait_until="domcontentloaded")
                await human_delay(4, 8)

                # Scroll down to trigger lazy loading
                await human_scroll(page)
                await human_delay(2, 4)
                await human_scroll(page)
                await human_delay(2, 3)

                # Wait for results
                loaded = await wait_for_content(
                    page,
                    "[class*='resultInner'], [class*='nrc6'], .Flights-Results-FlightResultItem",
                    timeout=25000,
                )

                if not loaded:
                    logger.warning("Could not load Kayak results")
                    try:
                        os.makedirs("screenshots", exist_ok=True)
                        await page.screenshot(path="screenshots/kayak_debug.png")
                        logger.info("Debug screenshot saved to screenshots/kayak_debug.png")
                    except Exception:
                        pass
                    return []

                # Wait a bit more for prices to render (they often load async)
                await human_delay(2, 4)

                # Extract flight results
                result_cards = await page.query_selector_all(
                    "[class*='resultInner'], [class*='nrc6'], "
                    ".Flights-Results-FlightResultItem"
                )

                for card in result_cards[:20]:
                    try:
                        card_text = await card.inner_text()
                        result = self._parse_kayak_result(card_text, request)
                        if result:
                            result.deep_link = page.url
                            results.append(result)
                    except Exception as e:
                        logger.debug(f"Error parsing Kayak result card: {e}")
                        continue

        except Exception as e:
            logger.error(f"Kayak search failed: {e}")

        results.sort(key=lambda r: r.price)
        return results

    def _parse_kayak_result(
        self, card_text: str, request: SearchRequest
    ) -> Optional[FlightResult]:
        """Parse a Kayak result card's text content into a FlightResult."""
        # Extract price (e.g., "$234", "$ 1,234")
        price_match = re.search(r"\$\s*([\d,]+)", card_text)
        if not price_match:
            return None

        price = float(price_match.group(1).replace(",", ""))
        if price < 10:
            return None

        # Extract airline name (usually at the start or a known pattern)
        airline = ""
        airline_patterns = [
            r"(United|Delta|American|Southwest|JetBlue|Alaska|Spirit|Frontier|"
            r"Hawaiian|Allegiant|Sun Country|British Airways|Lufthansa|"
            r"Air France|KLM|Emirates|Qatar|Singapore|Cathay|ANA|JAL|"
            r"Korean Air|Turkish|Iberia|Aer Lingus|Ryanair|easyJet|"
            r"WestJet|Air Canada|LATAM|Avianca|Copa|Volaris|"
            r"Multiple airlines|Various)"
        ]
        for pattern in airline_patterns:
            match = re.search(pattern, card_text, re.IGNORECASE)
            if match:
                airline = match.group(1)
                break

        # Extract duration (e.g., "5h 30m", "12h 05m")
        duration_match = re.search(r"(\d+)h\s*(\d+)m", card_text)
        duration_minutes = None
        if duration_match:
            duration_minutes = int(duration_match.group(1)) * 60 + int(
                duration_match.group(2)
            )

        # Extract stops
        stops = 0
        if re.search(r"nonstop|direct|non-stop", card_text, re.IGNORECASE):
            stops = 0
        else:
            stop_match = re.search(r"(\d+)\s*stop", card_text, re.IGNORECASE)
            if stop_match:
                stops = int(stop_match.group(1))

        # Extract times (e.g., "6:00 AM", "11:30 PM")
        times = re.findall(r"(\d{1,2}:\d{2}\s*[AaPp][Mm])", card_text)

        outbound = FlightLeg(
            departure_airport=request.origin,
            arrival_airport=request.destination,
            airline=airline,
            duration_minutes=duration_minutes,
            stops=stops,
        )

        if len(times) >= 2:
            try:
                outbound.departure_time = datetime.strptime(
                    f"{request.departure_date} {times[0].strip()}",
                    "%Y-%m-%d %I:%M %p",
                )
                outbound.arrival_time = datetime.strptime(
                    f"{request.departure_date} {times[1].strip()}",
                    "%Y-%m-%d %I:%M %p",
                )
            except (ValueError, TypeError):
                pass

        return FlightResult(
            price=price,
            currency="USD",
            outbound=outbound,
            source=Source.KAYAK,
        )
