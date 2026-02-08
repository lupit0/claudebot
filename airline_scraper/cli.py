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


def format_booking_links(results: list[FlightResult]) -> str:
    """Format booking links as a numbered list below the results table."""
    links = []
    seen = set()
    for i, flight in enumerate(results, 1):
        if flight.deep_link and flight.deep_link not in seen:
            links.append(f"  [{i}] {flight.deep_link}")
            seen.add(flight.deep_link)
    if not links:
        return ""
    return "\nBooking links (click to verify & book):\n" + "\n".join(links)


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
    print(format_booking_links(merged))
    print(format_summary(merged, request))

    # Export to file if --output is specified
    output_path = getattr(args, "output", None)
    if output_path and merged:
        _export_single_search(merged, request, output_path)

    return 0


def _export_single_search(
    flights: list[FlightResult], request: SearchRequest, output_path: str
):
    """Export a single search's results to CSV or JSON."""
    import csv as csv_mod
    import json as json_mod
    from pathlib import Path

    rows = []
    for f in flights:
        row = {
            "origin": request.origin,
            "destination": request.destination,
            "departure_date": request.departure_date.isoformat(),
            "return_date": request.return_date.isoformat() if request.return_date else "",
            "currency": f.currency,
            "price": f.price,
            "airline": f.outbound.airline if f.outbound else "",
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

    path = Path(output_path)
    if output_path.endswith(".json"):
        data = {
            "search": {
                "origin": request.origin,
                "destination": request.destination,
                "departure_date": request.departure_date.isoformat(),
                "return_date": request.return_date.isoformat() if request.return_date else None,
                "currency": request.currency,
                "cabin_class": request.cabin_class.value,
            },
            "results": rows,
        }
        with open(path, "w", encoding="utf-8") as f:
            json_mod.dump(data, f, indent=2, default=str)
        print(f"\nExported to JSON: {path}")
    else:
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv_mod.DictWriter(f, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
        print(f"\nExported to CSV: {path}")


async def run_date_range_search(args: argparse.Namespace) -> int:
    """Execute a date range search across all date combinations."""
    from airline_scraper.date_range import (
        export_csv,
        export_json,
        format_heatmap,
        format_matrix_table,
        generate_date_combinations,
        search_date_range,
    )

    cabin_class = CabinClass(args.cabin)

    # For date range mode, we use --date as dep_from and --date-to as dep_to
    # Return dates use --return as ret_from and --return-to as ret_to
    dep_from = args.date
    dep_to = args.date_to if args.date_to else dep_from
    ret_from = args.return_date
    ret_to = args.return_to if args.return_to else ret_from

    # Build a template request (dates will be overridden per combination)
    trip_type = TripType.ONE_WAY if args.one_way else TripType.ROUND_TRIP
    base_request = SearchRequest(
        origin=args.origin,
        destination=args.destination,
        departure_date=dep_from,
        return_date=ret_from,
        trip_type=trip_type,
        cabin_class=cabin_class,
        adults=args.adults,
        children=args.children,
        currency=args.currency.upper(),
        max_stops=args.max_stops,
    )

    # Generate date combinations
    date_pairs = generate_date_combinations(
        dep_from=dep_from,
        dep_to=dep_to,
        ret_from=ret_from if not args.one_way else None,
        ret_to=ret_to if not args.one_way else None,
        min_nights=args.min_nights,
        max_nights=args.max_nights,
    )

    if not date_pairs:
        print("No valid date combinations found. Check your date ranges.")
        return 1

    # Determine sources
    sources = None
    if args.source:
        sources = [s.strip() for s in args.source.split(",")]

    print(f"\nDate Range Search: {base_request.origin} → {base_request.destination}")
    print(f"Departure dates: {dep_from} to {dep_to}")
    if ret_from:
        print(f"Return dates:    {ret_from} to {ret_to}")
    print(f"Combinations:    {len(date_pairs)}")
    print(f"Currency:        {base_request.currency}")
    print(f"Sources:         {', '.join(sources) if sources else 'all'}")

    # Estimate time
    browser_sources = {"kayak", "skyscanner"}
    if sources and not any(s in browser_sources for s in sources):
        avg_delay = 5.5  # fast-flights only
    else:
        avg_delay = 30  # browser-based
    est_minutes = (len(date_pairs) * avg_delay) / 60
    print(f"Estimated time:  ~{est_minutes:.0f} minutes")
    print()

    # Run the search
    def on_progress(idx, total, pair, result):
        status = "OK" if result.cheapest else ("ERR" if result.error else "No results")
        price = result.cheapest.price_display if result.cheapest else "—"
        print(f"  [{idx + 1}/{total}] {pair.label}: {price} ({status})")

    results = await search_date_range(
        base_request=base_request,
        date_pairs=date_pairs,
        sources=sources,
        progress_callback=on_progress,
    )

    # Display results
    print()
    print(format_matrix_table(results, base_request))

    # Show heatmap if we have multiple dep + return dates
    heatmap = format_heatmap(results, base_request)
    if heatmap:
        print()
        print(heatmap)

    # Summary
    all_cheapest = [r.cheapest for r in results if r.cheapest]
    if all_cheapest:
        overall_cheapest = min(all_cheapest, key=lambda f: f.price)
        best_pair = next(r for r in results if r.cheapest and r.cheapest.price == overall_cheapest.price)
        print(f"\nBest deal: {overall_cheapest.price_display} on {best_pair.date_pair.label}")
        print(f"  {overall_cheapest.outbound_summary} [{overall_cheapest.source.value}]")
        if overall_cheapest.deep_link:
            print(f"  Book/verify: {overall_cheapest.deep_link}")
    else:
        print("\nNo results found for any date combination.")

    # Export to file if --output is specified
    output_path = getattr(args, "output", None)
    if output_path:
        all_flights_flag = getattr(args, "all_flights", False)
        if output_path.endswith(".json"):
            written = export_json(results, base_request, output_path, all_flights=all_flights_flag)
            print(f"\nExported to JSON: {written}")
        else:
            # Default to CSV (including .csv, .tsv, or any other extension)
            written = export_csv(results, base_request, output_path, all_flights=all_flights_flag)
            print(f"\nExported to CSV: {written}")

    return 0


def build_parser() -> argparse.ArgumentParser:
    """Build the CLI argument parser."""
    parser = argparse.ArgumentParser(
        prog="airline-scraper",
        description="Search and compare airline prices across multiple sources.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Single date round trip
  python -m airline_scraper JFK LAX --date 2025-03-15 --return 2025-03-22

  # Date range search — find cheapest across all date combinations
  python -m airline_scraper LHR BCN --date 2025-06-01 --date-to 2025-06-07 \\
      --return 2025-06-08 --return-to 2025-06-14

  # Date range with constraints (5-9 night trips only)
  python -m airline_scraper LHR CDG --date 2025-07-01 --date-to 2025-07-10 \\
      --return 2025-07-05 --return-to 2025-07-20 \\
      --min-nights 5 --max-nights 9

  # Fast date range (Google Flights only, no browser needed)
  python -m airline_scraper LHR FCO --date 2025-08-01 --date-to 2025-08-05 \\
      --return 2025-08-08 --return-to 2025-08-12 \\
      --source google_flights

  # Export date range results to CSV (opens in Excel/Google Sheets)
  python -m airline_scraper LHR BCN --date 2025-06-01 --date-to 2025-06-07 \\
      --return 2025-06-08 --return-to 2025-06-14 \\
      --output results.csv

  # Export ALL flights (not just cheapest) to JSON
  python -m airline_scraper LHR BCN --date 2025-06-01 --date-to 2025-06-07 \\
      --return 2025-06-08 --return-to 2025-06-14 \\
      --output results.json --all-flights

  # Direct flights only
  python -m airline_scraper LHR BCN --date 2025-06-01 --return 2025-06-08 --direct

  # One-way, business class
  python -m airline_scraper SFO LHR --date 2025-04-01 --one-way --cabin business

  # Specific source, nonstop only, in EUR
  python -m airline_scraper ORD NRT --date 2025-05-10 --return 2025-05-20 \\
      --source google_flights --direct --currency EUR
        """,
    )

    parser.add_argument("origin", help="Origin airport IATA code (e.g., JFK)")
    parser.add_argument("destination", help="Destination airport IATA code (e.g., LAX)")
    parser.add_argument(
        "--date", "-d", type=parse_date, required=True,
        help="Departure date (YYYY-MM-DD). Start of range if --date-to is set.",
    )
    parser.add_argument(
        "--date-to", type=parse_date,
        help="End of departure date range (YYYY-MM-DD). Enables date range mode.",
    )
    parser.add_argument(
        "--return", "-r", type=parse_date, dest="return_date",
        help="Return date (YYYY-MM-DD). Start of range if --return-to is set.",
    )
    parser.add_argument(
        "--return-to", type=parse_date,
        help="End of return date range (YYYY-MM-DD).",
    )
    parser.add_argument(
        "--min-nights", type=int, default=1,
        help="Minimum trip length in nights for date range mode (default: 1).",
    )
    parser.add_argument(
        "--max-nights", type=int, default=None,
        help="Maximum trip length in nights for date range mode (default: no limit).",
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
        "--direct", "--nonstop", action="store_true",
        help="Direct/nonstop flights only. Shorthand for --max-stops 0.",
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
        help="Timeout in seconds per search (default: 120).",
    )
    parser.add_argument(
        "--output", "-o",
        help=(
            "Export date range results to a file. "
            "Use .csv for CSV (opens in Excel/Sheets) or .json for JSON. "
            "Example: --output results.csv"
        ),
    )
    parser.add_argument(
        "--all-flights", action="store_true",
        help=(
            "When exporting, include ALL flights found per date combo, "
            "not just the cheapest. Produces a larger file with full comparison data."
        ),
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Enable verbose/debug logging.",
    )

    return parser


def _is_date_range_mode(args: argparse.Namespace) -> bool:
    """Check if date range mode is active."""
    return args.date_to is not None or args.return_to is not None


def main():
    """CLI entry point."""
    parser = build_parser()
    args = parser.parse_args()

    # Validate
    if not args.one_way and args.return_date is None:
        parser.error("--return is required for round-trip searches. Use --one-way for one-way flights.")

    if args.return_to and not args.return_date:
        parser.error("--return-to requires --return to be set.")

    if args.date_to and args.date_to < args.date:
        parser.error("--date-to must be on or after --date.")

    if args.return_to and args.return_date and args.return_to < args.return_date:
        parser.error("--return-to must be on or after --return.")

    # --direct / --nonstop is shorthand for --max-stops 0
    if args.direct:
        args.max_stops = 0

    setup_logging(args.verbose)

    try:
        if _is_date_range_mode(args):
            exit_code = asyncio.run(run_date_range_search(args))
        else:
            exit_code = asyncio.run(run_search(args))
    except KeyboardInterrupt:
        print("\nSearch cancelled.")
        exit_code = 130

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
