"""Date combination generator and rate-limited batch search.

Given a range of departure dates and return dates, generates all valid
combinations and searches them with appropriate delays to avoid detection.
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

from airline_scraper.models import FlightResult, SearchRequest, TripType
from airline_scraper.orchestrator import clear_blocked_sources, merge_and_rank, search_all
from airline_scraper.utils.airports import get_airport_name

logger = logging.getLogger(__name__)


@dataclass
class DatePair:
    """A departure + return date combination."""

    departure: date
    return_date: Optional[date]

    @property
    def label(self) -> str:
        dep = self.departure.strftime("%b %d")
        if self.return_date:
            ret = self.return_date.strftime("%b %d")
            nights = (self.return_date - self.departure).days
            return f"{dep} → {ret} ({nights}n)"
        return f"{dep} (one-way)"


@dataclass
class DatePairResult:
    """Search results for a single date combination."""

    date_pair: DatePair
    flights: list[FlightResult] = field(default_factory=list)
    cheapest: Optional[FlightResult] = None
    error: Optional[str] = None


def generate_date_combinations(
    dep_from: date,
    dep_to: date,
    ret_from: Optional[date] = None,
    ret_to: Optional[date] = None,
    min_nights: int = 1,
    max_nights: Optional[int] = None,
) -> list[DatePair]:
    """Generate all valid departure/return date pairs.

    Args:
        dep_from: Earliest departure date.
        dep_to: Latest departure date (inclusive).
        ret_from: Earliest return date. If None, one-way search.
        ret_to: Latest return date (inclusive).
        min_nights: Minimum trip length in nights.
        max_nights: Maximum trip length in nights (None = no limit).

    Returns:
        List of DatePair objects, sorted by departure then return date.
    """
    pairs = []

    dep_current = dep_from
    while dep_current <= dep_to:
        if ret_from is None or ret_to is None:
            # One-way
            pairs.append(DatePair(departure=dep_current, return_date=None))
        else:
            # Round trip: iterate return dates
            ret_current = max(ret_from, dep_current + timedelta(days=min_nights))
            while ret_current <= ret_to:
                nights = (ret_current - dep_current).days
                if nights >= min_nights and (max_nights is None or nights <= max_nights):
                    pairs.append(DatePair(departure=dep_current, return_date=ret_current))
                ret_current += timedelta(days=1)
        dep_current += timedelta(days=1)

    logger.info(f"Generated {len(pairs)} date combinations")
    return pairs


async def search_date_range(
    base_request: SearchRequest,
    date_pairs: list[DatePair],
    sources: Optional[list[str]] = None,
    delay_between_searches: tuple[float, float] = (15.0, 45.0),
    fast_flights_delay: tuple[float, float] = (3.0, 8.0),
    max_results_per_pair: int = 5,
    progress_callback=None,
) -> list[DatePairResult]:
    """Search all date combinations with rate limiting.

    Strategy:
    - For fast-flights (no browser): shorter delays (3-8s between searches)
    - For browser-based sources: longer delays (15-45s between searches)
    - Different sources for the SAME date pair run in parallel
    - Different date pairs run sequentially (with delays)

    Args:
        base_request: Template SearchRequest (dates will be overridden).
        date_pairs: List of date combinations to search.
        sources: Which sources to use. None = all.
        delay_between_searches: Min/max seconds between date pair searches.
        fast_flights_delay: Min/max seconds for fast-flights only searches.
        max_results_per_pair: Keep top N results per date pair.
        progress_callback: Called with (index, total, date_pair, result) after each search.

    Returns:
        List of DatePairResult, one per date pair.
    """
    # Reset any stale CAPTCHA blocks from previous searches
    clear_blocked_sources()

    results = []
    total = len(date_pairs)

    # Determine if we're using browser-based sources
    browser_sources = {"kayak", "skyscanner"}
    using_browser = False
    if sources:
        using_browser = any(s in browser_sources for s in sources)
    else:
        using_browser = True  # Default uses all sources

    for i, pair in enumerate(date_pairs):
        # Build request for this date combination
        trip_type = TripType.ONE_WAY if pair.return_date is None else TripType.ROUND_TRIP
        request = SearchRequest(
            origin=base_request.origin,
            destination=base_request.destination,
            departure_date=pair.departure,
            return_date=pair.return_date,
            trip_type=trip_type,
            cabin_class=base_request.cabin_class,
            adults=base_request.adults,
            children=base_request.children,
            currency=base_request.currency,
            max_stops=base_request.max_stops,
        )

        logger.info(f"[{i + 1}/{total}] Searching {pair.label}...")

        pair_result = DatePairResult(date_pair=pair)

        try:
            results_by_source = await search_all(
                request, sources=sources, timeout_seconds=60
            )
            merged = merge_and_rank(results_by_source, max_results=max_results_per_pair, max_stops=base_request.max_stops)
            pair_result.flights = merged
            if merged:
                pair_result.cheapest = merged[0]
                logger.info(
                    f"  → Cheapest: {merged[0].price_display} "
                    f"({merged[0].outbound_summary})"
                )
            else:
                logger.info("  → No results found")
        except Exception as e:
            logger.error(f"  → Error: {e}")
            pair_result.error = str(e)

        results.append(pair_result)

        if progress_callback:
            progress_callback(i, total, pair, pair_result)

        # Delay before next search (skip after the last one)
        if i < total - 1:
            if using_browser:
                delay = random.uniform(*delay_between_searches)
            else:
                delay = random.uniform(*fast_flights_delay)
            logger.info(f"  Waiting {delay:.0f}s before next search...")
            await asyncio.sleep(delay)

    return results


def format_matrix_table(
    results: list[DatePairResult],
    request: SearchRequest,
) -> str:
    """Format results as a matrix table showing cheapest price per date combination."""
    try:
        from rich.console import Console
        from rich.table import Table

        table = Table(
            title=f"Price Matrix: {request.origin} → {request.destination} ({request.currency})",
            show_lines=True,
        )
        table.add_column("Dates", style="bold", width=25)
        table.add_column("Cheapest", style="bold green", width=12)
        table.add_column("Airline", width=20)
        table.add_column("Stops", width=10)
        table.add_column("Duration", width=10)
        table.add_column("Source", style="cyan", width=15)
        table.add_column("# Found", style="dim", width=8)

        for r in results:
            if r.error:
                table.add_row(
                    r.date_pair.label, "ERROR", "", "", "", "", r.error[:20]
                )
            elif r.cheapest:
                f = r.cheapest
                airline = ""
                stops = ""
                duration = ""
                if f.outbound:
                    airline = f.outbound.airline or "—"
                    stops = (
                        "Nonstop"
                        if f.outbound.stops == 0
                        else f"{f.outbound.stops} stop{'s' if f.outbound.stops > 1 else ''}"
                    )
                    if f.outbound.duration_minutes:
                        h, m = divmod(f.outbound.duration_minutes, 60)
                        duration = f"{h}h {m:02d}m"

                table.add_row(
                    r.date_pair.label,
                    f.price_display,
                    airline,
                    stops,
                    duration,
                    f.source.value,
                    str(len(r.flights)),
                )
            else:
                table.add_row(r.date_pair.label, "—", "", "", "", "", "0")

        console = Console()
        with console.capture() as capture:
            console.print(table)
        return capture.get()

    except ImportError:
        # Fallback plain text
        lines = [
            f"Price Matrix: {request.origin} → {request.destination} ({request.currency})",
            "=" * 70,
        ]
        for r in results:
            if r.error:
                lines.append(f"  {r.date_pair.label:25s}  ERROR: {r.error}")
            elif r.cheapest:
                f = r.cheapest
                lines.append(
                    f"  {r.date_pair.label:25s}  {f.price_display:>8s}  "
                    f"{f.outbound_summary}  [{f.source.value}]  "
                    f"({len(r.flights)} results)"
                )
            else:
                lines.append(f"  {r.date_pair.label:25s}  —")
        return "\n".join(lines)


def format_heatmap(
    results: list[DatePairResult],
    request: SearchRequest,
) -> str:
    """Format results as a departure x return date heatmap grid.

    Only works for round-trip searches with multiple departure and return dates.
    Shows cheapest price at each intersection.
    """
    # Collect unique departure and return dates
    dep_dates = sorted(set(r.date_pair.departure for r in results))
    ret_dates = sorted(set(r.date_pair.return_date for r in results if r.date_pair.return_date))

    if not ret_dates or len(dep_dates) < 2 or len(ret_dates) < 2:
        return ""  # Not enough data for a heatmap

    # Build lookup: (dep, ret) -> cheapest price display
    lookup: dict[tuple[date, date], str] = {}
    for r in results:
        if r.cheapest and r.date_pair.return_date:
            lookup[(r.date_pair.departure, r.date_pair.return_date)] = r.cheapest.price_display
        elif r.date_pair.return_date:
            lookup[(r.date_pair.departure, r.date_pair.return_date)] = "—"

    try:
        from rich.console import Console
        from rich.table import Table

        table = Table(
            title=f"Heatmap: {request.origin} → {request.destination} ({request.currency})",
            show_lines=True,
        )
        table.add_column("Dep \\ Ret", style="bold", width=8)
        for ret in ret_dates:
            table.add_column(ret.strftime("%b %d"), width=8)

        # Find min price for highlighting
        all_prices = [
            r.cheapest.price for r in results if r.cheapest
        ]
        min_price = min(all_prices) if all_prices else 0

        for dep in dep_dates:
            row = [dep.strftime("%b %d")]
            for ret in ret_dates:
                if ret <= dep:
                    row.append("")  # Invalid combination
                else:
                    cell = lookup.get((dep, ret), "—")
                    # Highlight the cheapest
                    matching = [r for r in results if r.date_pair.departure == dep and r.date_pair.return_date == ret]
                    if matching and matching[0].cheapest and matching[0].cheapest.price == min_price:
                        cell = f"[bold green]{cell}[/]"
                    row.append(cell)
            table.add_row(*row)

        console = Console()
        with console.capture() as capture:
            console.print(table)
        return capture.get()

    except ImportError:
        # Plain text fallback
        col_width = 10
        header = "Dep\\Ret".ljust(col_width) + "".join(
            d.strftime("%b %d").rjust(col_width) for d in ret_dates
        )
        lines = [
            f"Heatmap: {request.origin} → {request.destination} ({request.currency})",
            header,
            "-" * len(header),
        ]
        for dep in dep_dates:
            row = dep.strftime("%b %d").ljust(col_width)
            for ret in ret_dates:
                if ret <= dep:
                    row += "".rjust(col_width)
                else:
                    row += lookup.get((dep, ret), "—").rjust(col_width)
            lines.append(row)
        return "\n".join(lines)


def _fmt_time(dt) -> str:
    """Format a datetime as HH:MM or empty string."""
    if dt:
        return dt.strftime("%H:%M")
    return ""


def _result_to_row(r: DatePairResult, request: SearchRequest) -> dict:
    """Convert a DatePairResult to a flat dict for export."""
    row = {
        "origin": request.origin,
        "origin_airport": get_airport_name(request.origin),
        "destination": request.destination,
        "destination_airport": get_airport_name(request.destination),
        "departure_date": r.date_pair.departure.isoformat(),
        "return_date": r.date_pair.return_date.isoformat() if r.date_pair.return_date else "",
        "nights": (r.date_pair.return_date - r.date_pair.departure).days if r.date_pair.return_date else "",
        "currency": request.currency,
        "cheapest_price": "",
        "airline": "",
        "outbound_departure": "",
        "outbound_arrival": "",
        "return_departure": "",
        "stops": "",
        "duration_minutes": "",
        "duration": "",
        "source": "",
        "booking_link": "",
        "results_count": len(r.flights),
        "error": r.error or "",
    }
    if r.cheapest:
        f = r.cheapest
        row["cheapest_price"] = f.price
        row["source"] = f.source.value
        row["booking_link"] = f.deep_link
        if f.outbound:
            row["airline"] = f.outbound.airline
            row["outbound_departure"] = _fmt_time(f.outbound.departure_time)
            row["outbound_arrival"] = _fmt_time(f.outbound.arrival_time)
            row["stops"] = f.outbound.stops
            row["duration_minutes"] = f.outbound.duration_minutes or ""
            if f.outbound.duration_minutes:
                h, m = divmod(f.outbound.duration_minutes, 60)
                row["duration"] = f"{h}h {m:02d}m"
        if f.return_leg:
            row["return_departure"] = _fmt_time(f.return_leg.departure_time)
    return row


def _all_flights_rows(results: list[DatePairResult], request: SearchRequest) -> list[dict]:
    """Flatten ALL flights (not just cheapest) into rows for export."""
    rows = []
    for r in results:
        for f in r.flights:
            row = {
                "origin": request.origin,
                "origin_airport": get_airport_name(request.origin),
                "destination": request.destination,
                "destination_airport": get_airport_name(request.destination),
                "departure_date": r.date_pair.departure.isoformat(),
                "return_date": r.date_pair.return_date.isoformat() if r.date_pair.return_date else "",
                "nights": (r.date_pair.return_date - r.date_pair.departure).days if r.date_pair.return_date else "",
                "currency": f.currency,
                "price": f.price,
                "airline": f.outbound.airline if f.outbound else "",
                "outbound_departure": _fmt_time(f.outbound.departure_time) if f.outbound else "",
                "outbound_arrival": _fmt_time(f.outbound.arrival_time) if f.outbound else "",
                "return_departure": _fmt_time(f.return_leg.departure_time) if f.return_leg else "",
                "stops": f.outbound.stops if f.outbound else "",
                "duration_minutes": (f.outbound.duration_minutes or "") if f.outbound else "",
                "source": f.source.value,
                "booking_link": f.deep_link,
            }
            if f.outbound and f.outbound.duration_minutes:
                h, m = divmod(f.outbound.duration_minutes, 60)
                row["duration"] = f"{h}h {m:02d}m"
            else:
                row["duration"] = ""
            rows.append(row)
    return rows


def export_csv(
    results: list[DatePairResult],
    request: SearchRequest,
    output_path: str,
    all_flights: bool = False,
) -> str:
    """Export results to a CSV file.

    Args:
        results: The search results.
        request: The base search request.
        output_path: File path to write to.
        all_flights: If True, export every flight found (not just cheapest per date).
                     If False, export one row per date combination (cheapest only).

    Returns:
        The path written to.
    """
    if all_flights:
        rows = _all_flights_rows(results, request)
    else:
        rows = [_result_to_row(r, request) for r in results]

    if not rows:
        rows = [{"info": "No results found"}]

    path = Path(output_path)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    return str(path)


def export_json(
    results: list[DatePairResult],
    request: SearchRequest,
    output_path: str,
    all_flights: bool = False,
) -> str:
    """Export results to a JSON file.

    Args:
        results: The search results.
        request: The base search request.
        output_path: File path to write to.
        all_flights: If True, export every flight found.

    Returns:
        The path written to.
    """
    if all_flights:
        rows = _all_flights_rows(results, request)
    else:
        rows = [_result_to_row(r, request) for r in results]

    data = {
        "search": {
            "origin": request.origin,
            "destination": request.destination,
            "currency": request.currency,
            "cabin_class": request.cabin_class.value,
            "adults": request.adults,
            "children": request.children,
        },
        "results": rows,
    }

    path = Path(output_path)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)

    return str(path)


def results_to_dataframe(
    results: list[DatePairResult],
    request: SearchRequest,
    all_flights: bool = False,
):
    """Convert results to a pandas DataFrame.

    Requires pandas to be installed. Returns a DataFrame with one row
    per date combination (cheapest) or one row per flight (all_flights=True).
    """
    try:
        import pandas as pd
    except ImportError:
        raise ImportError(
            "pandas is required for DataFrame export. "
            "Install with: pip install pandas"
        )

    if all_flights:
        rows = _all_flights_rows(results, request)
    else:
        rows = [_result_to_row(r, request) for r in results]

    df = pd.DataFrame(rows)

    # Convert numeric columns
    price_col = "price" if all_flights else "cheapest_price"
    if price_col in df.columns:
        df[price_col] = pd.to_numeric(df[price_col], errors="coerce")
    if "stops" in df.columns:
        df["stops"] = pd.to_numeric(df["stops"], errors="coerce")
    if "duration_minutes" in df.columns:
        df["duration_minutes"] = pd.to_numeric(df["duration_minutes"], errors="coerce")
    if "nights" in df.columns:
        df["nights"] = pd.to_numeric(df["nights"], errors="coerce")

    # Convert date columns
    for col in ["departure_date", "return_date"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce").dt.date

    return df
