"""Command-line interface for the airline price scraper."""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import date, datetime
from typing import Optional

from airline_scraper.models import CabinClass, FlightResult, SearchRequest, TripType
from airline_scraper.orchestrator import SCRAPER_REGISTRY, merge_and_rank, search_all


def setup_logging(verbose: bool = False):
    """Configure logging."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    # Quiet down noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def parse_date(date_str: str) -> date:
    """Parse a date string in YYYY-MM-DD format."""
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise argparse.ArgumentTypeError(
            f"Invalid date format: '{date_str}'. Use YYYY-MM-DD."
        )


def format_results_table(results: list[FlightResult]) -> str:
    """Format flight results as a readable table."""
    try:
        from rich.console import Console
        from rich.table import Table

        table = Table(title="Flight Search Results", show_lines=True)
        table.add_column("#", style="dim", width=3)
        table.add_column("Price", style="bold green", width=10)
        table.add_column("Airline", width=20)
        table.add_column("Route", width=15)
        table.add_column("Stops", width=10)
        table.add_column("Duration", width=10)
        table.add_column("Source", style="cyan", width=15)

        for i, flight in enumerate(results, 1):
            stops_str = ""
            duration_str = ""
            airline_str = ""
            route_str = ""

            if flight.outbound:
                leg = flight.outbound
                airline_str = leg.airline or "—"
                route_str = f"{leg.departure_airport}→{leg.arrival_airport}"
                stops_str = (
                    "Nonstop"
                    if leg.stops == 0
                    else f"{leg.stops} stop{'s' if leg.stops > 1 else ''}"
                )
                if leg.duration_minutes:
                    h, m = divmod(leg.duration_minutes, 60)
                    duration_str = f"{h}h {m:02d}m"

            table.add_row(
                str(i),
                flight.price_display,
                airline_str,
                route_str,
                stops_str,
                duration_str,
                flight.source.value,
            )

        console = Console()
        with console.capture() as capture:
            console.print(table)
        return capture.get()

    except ImportError:
        # Fallback to simple tabulate
        try:
            from tabulate import tabulate

            rows = []
            for i, flight in enumerate(results, 1):
                airline = ""
                route = ""
                stops = ""
                duration = ""
                if flight.outbound:
                    leg = flight.outbound
                    airline = leg.airline or "—"
                    route = f"{leg.departure_airport}→{leg.arrival_airport}"
                    stops = (
                        "Nonstop"
                        if leg.stops == 0
                        else f"{leg.stops} stop{'s' if leg.stops > 1 else ''}"
                    )
                    if leg.duration_minutes:
                        h, m = divmod(leg.duration_minutes, 60)
                        duration = f"{h}h {m:02d}m"
                rows.append(
                    [i, flight.price_display, airline, route, stops, duration, flight.source.value]
                )

            return tabulate(
                rows,
                headers=["#", "Price", "Airline", "Route", "Stops", "Duration", "Source"],
                tablefmt="grid",
            )
        except ImportError:
            # Ultra-fallback: plain text
            lines = ["Flight Search Results", "=" * 60]
            for i, flight in enumerate(results, 1):
                lines.append(f"{i}. {flight.price_display} - {flight.outbound_summary} [{flight.source.value}]")
            return "\n".join(lines)


def format_summary(results: list[FlightResult], request: SearchRequest) -> str:
    """Format a summary of the search results."""
    if not results:
        return "No flights found."

    cheapest = results[0]
    most_expensive = results[-1]

    lines = [
        f"\nSearch: {request.origin} → {request.destination}",
        f"Date: {request.departure_date}",
    ]
    if request.return_date:
        lines.append(f"Return: {request.return_date}")
    lines.extend([
        f"Cabin: {request.cabin_class.value}",
        f"Currency: {request.currency}",
        f"Passengers: {request.adults} adult(s)" + (f", {request.children} child(ren)" if request.children else ""),
        "",
        f"Results found: {len(results)}",
        f"Cheapest: {cheapest.price_display} ({cheapest.outbound_summary})",
        f"Most expensive: {most_expensive.price_display} ({most_expensive.outbound_summary})",
    ])
    return "\n".join(lines)


async def run_search(args: argparse.Namespace) -> int:
    """Execute the flight search."""
    # Build the search request
    trip_type = TripType.ONE_WAY if args.one_way else TripType.ROUND_TRIP
    cabin_class = CabinClass(args.cabin)

    request = SearchRequest(
        origin=args.origin,
        destination=args.destination,
        departure_date=args.date,
        return_date=args.return_date,
        trip_type=trip_type,
        cabin_class=cabin_class,
        adults=args.adults,
        children=args.children,
        currency=args.currency.upper(),
        max_stops=args.max_stops,
    )

    # Determine which sources to search
    sources = None
    if args.source:
        sources = [s.strip() for s in args.source.split(",")]

    print(f"\nSearching for flights: {request.origin} → {request.destination}")
    print(f"Departure: {request.departure_date}", end="")
    if request.return_date:
        print(f"  Return: {request.return_date}")
    else:
        print(" (one-way)")
    print(f"Currency: {request.currency}")
    print(f"Sources: {', '.join(sources) if sources else 'all'}")
    print()

    # Run the search
    results_by_source = await search_all(
        request, sources=sources, timeout_seconds=args.timeout
    )

    # Report per-source results
    for source_name, source_results in results_by_source.items():
        print(f"  {source_name}: {len(source_results)} results")

    # Merge and rank
    merged = merge_and_rank(results_by_source, max_results=args.limit)

    if not merged:
        print("\nNo flights found. Try different dates or sources.")
        return 1

    # Display results
    print(format_results_table(merged))
    print(format_summary(merged, request))

    return 0


def build_parser() -> argparse.ArgumentParser:
    """Build the CLI argument parser."""
    parser = argparse.ArgumentParser(
        prog="airline-scraper",
        description="Search and compare airline prices across multiple sources.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Round trip JFK to LAX
  python -m airline_scraper JFK LAX --date 2025-03-15 --return 2025-03-22

  # One-way, business class
  python -m airline_scraper SFO LHR --date 2025-04-01 --one-way --cabin business

  # Only search Google Flights, nonstop only
  python -m airline_scraper ORD NRT --date 2025-05-10 --return 2025-05-20 \\
      --source google_flights --max-stops 0

  # Search with more passengers
  python -m airline_scraper LAX CDG --date 2025-06-01 --return 2025-06-15 \\
      --adults 2 --children 1
        """,
    )

    parser.add_argument("origin", help="Origin airport IATA code (e.g., JFK)")
    parser.add_argument("destination", help="Destination airport IATA code (e.g., LAX)")
    parser.add_argument(
        "--date", "-d", type=parse_date, required=True,
        help="Departure date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--return", "-r", type=parse_date, dest="return_date",
        help="Return date (YYYY-MM-DD). Required unless --one-way is set.",
    )
    parser.add_argument(
        "--one-way", action="store_true",
        help="Search for one-way flights only.",
    )
    parser.add_argument(
        "--cabin", "-c", default="economy",
        choices=["economy", "premium_economy", "business", "first"],
        help="Cabin class (default: economy).",
    )
    parser.add_argument(
        "--adults", type=int, default=1,
        help="Number of adult passengers (default: 1).",
    )
    parser.add_argument(
        "--children", type=int, default=0,
        help="Number of child passengers (default: 0).",
    )
    parser.add_argument(
        "--currency", default="GBP",
        help="Currency for prices, ISO 4217 code (default: GBP). Examples: GBP, USD, EUR.",
    )
    parser.add_argument(
        "--max-stops", type=int, default=None,
        help="Maximum number of stops (0=nonstop, 1, 2). Default: any.",
    )
    parser.add_argument(
        "--source", "-s",
        help=(
            "Comma-separated list of sources to search. "
            f"Available: {', '.join(SCRAPER_REGISTRY.keys())}. "
            "Default: all."
        ),
    )
    parser.add_argument(
        "--limit", "-l", type=int, default=20,
        help="Maximum number of results to display (default: 20).",
    )
    parser.add_argument(
        "--timeout", "-t", type=int, default=120,
        help="Timeout in seconds for all scrapers (default: 120).",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Enable verbose/debug logging.",
    )

    return parser


def main():
    """CLI entry point."""
    parser = build_parser()
    args = parser.parse_args()

    # Validate round-trip requires return date
    if not args.one_way and args.return_date is None:
        parser.error("--return is required for round-trip searches. Use --one-way for one-way flights.")

    setup_logging(args.verbose)

    try:
        exit_code = asyncio.run(run_search(args))
    except KeyboardInterrupt:
        print("\nSearch cancelled.")
        exit_code = 130

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
