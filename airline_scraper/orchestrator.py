"""Search orchestrator - runs scrapers concurrently and merges results."""

from __future__ import annotations

import asyncio
import logging
import time
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

# Track sources that are CAPTCHA-blocked so we can skip them on subsequent
# searches (e.g., across date range combinations).  Maps source name to the
# timestamp when the block was recorded so we can expire stale entries.
_captcha_blocked_sources: dict[str, float] = {}
_CAPTCHA_BLOCK_TTL = 600  # 10 minutes — stop retrying a blocked source for this long


def get_scraper(name: str) -> BaseScraper:
    """Instantiate a scraper by name."""
    cls = SCRAPER_REGISTRY.get(name)
    if cls is None:
        raise ValueError(
            f"Unknown scraper: {name}. Available: {list(SCRAPER_REGISTRY.keys())}"
        )
    return cls()


def mark_source_blocked(source_name: str) -> None:
    """Mark a source as CAPTCHA-blocked so subsequent searches skip it."""
    _captcha_blocked_sources[source_name] = time.monotonic()
    logger.info(
        f"Marked {source_name} as CAPTCHA-blocked — will skip for {_CAPTCHA_BLOCK_TTL}s"
    )


def is_source_blocked(source_name: str) -> bool:
    """Check if a source is currently CAPTCHA-blocked."""
    blocked_at = _captcha_blocked_sources.get(source_name)
    if blocked_at is None:
        return False
    if time.monotonic() - blocked_at > _CAPTCHA_BLOCK_TTL:
        del _captcha_blocked_sources[source_name]
        return False
    return True


def clear_blocked_sources() -> None:
    """Reset the blocked-sources tracker (e.g., between routes)."""
    _captcha_blocked_sources.clear()


async def search_single(
    scraper: BaseScraper,
    request: SearchRequest,
    per_source_timeout: int = 90,
) -> tuple[str, list[FlightResult]]:
    """Run a single scraper with its own timeout.

    Returns (scraper_name, results). On timeout or error, returns empty list.
    """
    try:
        logger.info(f"Searching {scraper.name}...")
        results = await asyncio.wait_for(
            scraper.search(request),
            timeout=per_source_timeout,
        )
        logger.info(f"{scraper.name}: found {len(results)} results")
        return scraper.name, results
    except asyncio.TimeoutError:
        logger.warning(f"{scraper.name}: timed out after {per_source_timeout}s")
        return scraper.name, []
    except Exception as e:
        logger.error(f"{scraper.name} failed: {e}")
        return scraper.name, []


async def search_all(
    request: SearchRequest,
    sources: Optional[list[str]] = None,
    timeout_seconds: int = 120,
) -> dict[str, list[FlightResult]]:
    """Search multiple sources concurrently.

    Uses asyncio.wait instead of asyncio.wait_for+gather so that results
    from completed scrapers are preserved even if another scraper times out.

    Each source also has its own per-source timeout (90s) so a single slow
    source is cancelled independently without affecting others.

    Args:
        request: The flight search parameters.
        sources: List of source names to search. Defaults to all available.
        timeout_seconds: Max total time to wait for all scrapers.

    Returns:
        Dict mapping source name to list of FlightResults.
    """
    if sources is None:
        sources = list(SCRAPER_REGISTRY.keys())

    # Filter out CAPTCHA-blocked sources
    active_sources = []
    for name in sources:
        if is_source_blocked(name):
            logger.info(f"Skipping {name} — CAPTCHA-blocked from previous search")
        else:
            active_sources.append(name)

    scrapers = []
    for name in active_sources:
        try:
            scrapers.append(get_scraper(name))
        except ValueError as e:
            logger.warning(str(e))

    if not scrapers:
        logger.error("No valid scrapers to run")
        return {}

    # Per-source timeout is shorter than total timeout to give room
    per_source_timeout = min(90, timeout_seconds - 5)

    # Wrap each scraper in its own task with per-source timeout
    tasks = {
        asyncio.create_task(
            search_single(s, request, per_source_timeout),
            name=s.name,
        ): s.name
        for s in scrapers
    }

    # Wait for all tasks with a total timeout — asyncio.wait returns
    # (done, pending) so completed results are never discarded
    done, pending = await asyncio.wait(
        tasks.keys(),
        timeout=timeout_seconds,
    )

    # Cancel any still-running tasks
    for task in pending:
        source_name = tasks[task]
        logger.warning(f"{source_name}: still running after {timeout_seconds}s total timeout, cancelling")
        task.cancel()

    # Collect results from completed tasks
    results: dict[str, list[FlightResult]] = {}
    failed_sources = []
    succeeded_sources = []

    for task in done:
        try:
            name, flight_list = task.result()
            results[name] = flight_list
            if flight_list:
                succeeded_sources.append(name)
            else:
                failed_sources.append(name)
        except Exception as e:
            logger.error(f"Scraper task error: {e}")

    # Add timed-out sources to failed list
    for task in pending:
        source_name = tasks[task]
        failed_sources.append(source_name)
        results[source_name] = []

    # Log summary of source results for diagnostics
    if failed_sources and succeeded_sources:
        logger.info(
            f"Partial results for {request.origin}→{request.destination}: "
            f"succeeded=[{', '.join(succeeded_sources)}], "
            f"no results=[{', '.join(failed_sources)}]"
        )
    elif failed_sources and not succeeded_sources:
        logger.warning(
            f"No results from any source for {request.origin}→{request.destination}. "
            "All sources may be CAPTCHA-blocked. Try setting PROXY_URL to a residential proxy."
        )

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
