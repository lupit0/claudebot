"""Search orchestrator - runs scrapers concurrently and merges results."""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from airline_scraper.models import FlightResult, SearchRequest, Source
from airline_scraper.scrapers.base import BaseScraper
from airline_scraper.scrapers.google_flights import GoogleFlightsScraper
from airline_scraper.scrapers.kayak import KayakScraper
from airline_scraper.scrapers.skyscanner import SkyscannerScraper

logger = logging.getLogger(__name__)

# Map source names to scraper classes
SCRAPER_REGISTRY: dict[str, type[BaseScraper]] = {
    "google_flights": GoogleFlightsScraper,
    "kayak": KayakScraper,
    "skyscanner": SkyscannerScraper,
}


def get_scraper(name: str) -> BaseScraper:
    """Instantiate a scraper by name."""
    cls = SCRAPER_REGISTRY.get(name)
    if cls is None:
        raise ValueError(
            f"Unknown scraper: {name}. Available: {list(SCRAPER_REGISTRY.keys())}"
        )
    return cls()


async def search_single(
    scraper: BaseScraper,
    request: SearchRequest,
) -> tuple[str, list[FlightResult]]:
    """Run a single scraper and return its name + results."""
    try:
        logger.info(f"Searching {scraper.name}...")
        results = await scraper.search(request)
        logger.info(f"{scraper.name}: found {len(results)} results")
        return scraper.name, results
    except Exception as e:
        logger.error(f"{scraper.name} failed: {e}")
        return scraper.name, []


async def search_all(
    request: SearchRequest,
    sources: Optional[list[str]] = None,
    timeout_seconds: int = 120,
) -> dict[str, list[FlightResult]]:
    """Search multiple sources concurrently.

    Args:
        request: The flight search parameters.
        sources: List of source names to search. Defaults to all available.
        timeout_seconds: Max time to wait for all scrapers.

    Returns:
        Dict mapping source name to list of FlightResults.
    """
    if sources is None:
        sources = list(SCRAPER_REGISTRY.keys())

    scrapers = []
    for name in sources:
        try:
            scrapers.append(get_scraper(name))
        except ValueError as e:
            logger.warning(str(e))

    if not scrapers:
        logger.error("No valid scrapers to run")
        return {}

    # Run all scrapers concurrently with a timeout
    tasks = [search_single(s, request) for s in scrapers]
    try:
        completed = await asyncio.wait_for(
            asyncio.gather(*tasks, return_exceptions=True),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError:
        logger.warning(f"Search timed out after {timeout_seconds}s")
        completed = []

    results: dict[str, list[FlightResult]] = {}
    for item in completed:
        if isinstance(item, tuple):
            name, flight_list = item
            results[name] = flight_list
        elif isinstance(item, Exception):
            logger.error(f"Scraper error: {item}")

    return results


def merge_and_rank(
    results: dict[str, list[FlightResult]],
    max_results: int = 20,
    max_stops: Optional[int] = None,
) -> list[FlightResult]:
    """Merge results from multiple sources and rank by price.

    Deduplicates near-identical flights (same airline, similar price,
    same route) and returns the cheapest options.
    """
    all_flights: list[FlightResult] = []
    for source_results in results.values():
        all_flights.extend(source_results)

    # Post-filter by max_stops as a safety net (some scrapers may not
    # filter server-side, or may return flights that bypass the filter).
    if max_stops is not None:
        filtered = []
        for f in all_flights:
            stops = f.outbound.stops if f.outbound else 0
            if stops <= max_stops:
                filtered.append(f)
        dropped = len(all_flights) - len(filtered)
        if dropped:
            logger.info(f"Filtered out {dropped} flights exceeding {max_stops} stops")
        all_flights = filtered

    # Sort by price
    all_flights.sort(key=lambda f: f.price)

    # Deduplicate: remove flights with same airline and very similar price
    seen: list[FlightResult] = []
    for flight in all_flights:
        is_dup = False
        for existing in seen:
            same_airline = (
                flight.outbound
                and existing.outbound
                and flight.outbound.airline
                and flight.outbound.airline == existing.outbound.airline
            )
            similar_price = abs(flight.price - existing.price) < 5
            if same_airline and similar_price:
                is_dup = True
                break
        if not is_dup:
            seen.append(flight)

    return seen[:max_results]
