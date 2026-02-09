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
from airline_scraper.utils.airports import validate_stops
from airline_scraper.utils.links import kayak_link
from airline_scraper.utils.browser import (
    create_browser,
    detect_challenge,
    dismiss_cookie_consent,
    human_delay,
    human_scroll,
    try_bypass_cloudflare,
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

        # Kayak uses a currency query parameter
        url += f"&currency={request.currency}"

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
                await dismiss_cookie_consent(page)
                await human_delay(1, 2)

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
                    # Check if we're blocked by CAPTCHA
                    challenge = await detect_challenge(page)
                    if challenge:
                        # Try pydoll's native Cloudflare bypass (Kayak uses DataDome,
                        # not Cloudflare, but try anyway in case detection was generic)
                        if "cloudflare" in challenge.lower() or "turnstile" in challenge.lower():
                            bypassed = await try_bypass_cloudflare(page)
                            if bypassed:
                                challenge = await detect_challenge(page)
                                if not challenge:
                                    logger.info("CAPTCHA bypass succeeded on Kayak, retrying load...")
                                    loaded = await wait_for_content(
                                        page,
                                        "[class*='resultInner'], [class*='nrc6'], .Flights-Results-FlightResultItem",
                                        timeout=15000,
                                        max_retries=0,
                                    )
                    if not loaded:
                        challenge = await detect_challenge(page)
                        if challenge:
                            logger.warning(
                                f"Kayak CAPTCHA-blocked for {request.origin}→{request.destination}: {challenge}"
                            )
                            try:
                                from airline_scraper.orchestrator import mark_source_blocked
                                mark_source_blocked("kayak")
                            except ImportError:
                                pass
                        else:
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
                            result.deep_link = kayak_link(request)
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
        # Extract price — match any currency symbol (£, $, €) or plain number
        price_match = re.search(r"[£$€]\s*([\d,]+)", card_text)
        if not price_match:
            # Fallback: look for a standalone number that looks like a price
            price_match = re.search(r"([\d,]{2,})", card_text)
        if not price_match:
            return None

        price = float(price_match.group(1).replace(",", ""))
        if price < 10:
            return None

        # Extract airline name — longer names first, word-boundary for short ones
        airline = ""
        airlines_list = [
            "British Airways", "American Airlines", "Alaska Airlines",
            "Hawaiian Airlines", "Japan Airlines", "Turkish Airlines",
            "Singapore Airlines", "Brussels Airlines", "Sun Country",
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
            "Austrian", "Aegean", "Allegiant",
            "Iberia", "Aer Lingus",
            "Southwest", "JetBlue", "Frontier",
            "WestJet", "LATAM", "Avianca", "Volaris",
            "Qantas", "Etihad", "Oman Air", "Gulf Air", "Saudia",
            "EgyptAir", "ITA Airways", "Transavia",
            "Eurowings", "Condor",
            "Multiple airlines", "Various",
            "KLM", "ANA", "JAL", "SAS", "LOT", "TUI",
            "United", "Delta", "American", "Alaska",
            "Spirit", "Copa",
        ]
        card_lower = card_text.lower()
        for a in airlines_list:
            if len(a) <= 4:
                if re.search(r"(?<![a-zA-Z])" + re.escape(a) + r"(?![a-zA-Z])", card_text, re.IGNORECASE):
                    airline = a
                    break
            else:
                if a.lower() in card_lower:
                    airline = a
                    break

        # Extract duration (e.g., "5h 30m", "12h 05m")
        duration_match = re.search(r"(\d+)h\s*(\d+)m", card_text)
        duration_minutes = None
        if duration_match:
            duration_minutes = int(duration_match.group(1)) * 60 + int(
                duration_match.group(2)
            )

        # Extract stops — check for explicit stop count FIRST
        stops = 0
        stop_match = re.search(r"(\d+)\s*stop", card_text, re.IGNORECASE)
        if stop_match:
            stops = int(stop_match.group(1))
        elif re.search(r"nonstop|direct|non-stop", card_text, re.IGNORECASE):
            stops = 0

        # Validate stops against route distance
        stops = validate_stops(stops, duration_minutes, request.origin, request.destination)

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
            currency=request.currency,
            outbound=outbound,
            source=Source.KAYAK,
        )
