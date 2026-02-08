# Airline Price Scraper

Search and compare flight prices across multiple sources (Google Flights, Kayak, Skyscanner) with anti-bot detection evasion.

## Architecture

The scraper uses a layered approach to maximize reliability:

1. **Google Flights (primary)** — Uses the `fast-flights` library which queries Google Flights via encoded Protobuf requests. No browser needed, fast, and hard to detect.
2. **Browser fallback** — When lightweight methods fail, Patchright (an undetected fork of Playwright) automates a real Chromium browser with anti-detection patches:
   - Fixes CDP `Runtime.enable` leak
   - Sets `navigator.webdriver = false`
   - Removes `HeadlessChrome` user-agent markers
   - Supports human-like typing, scrolling, and delays
3. **Multi-source comparison** — Runs scrapers concurrently and merges/deduplicates results.

## Installation

```bash
# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
# .venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Install Patchright browsers (needed for Kayak/Skyscanner and Google Flights fallback)
python -m patchright install chromium
```

## Usage

```bash
# Round trip: JFK to LAX
python -m airline_scraper JFK LAX --date 2025-03-15 --return 2025-03-22

# One-way, business class
python -m airline_scraper SFO LHR --date 2025-04-01 --one-way --cabin business

# Only search Google Flights, nonstop only
python -m airline_scraper ORD NRT --date 2025-05-10 --return 2025-05-20 \
    --source google_flights --max-stops 0

# Multiple passengers
python -m airline_scraper LAX CDG --date 2025-06-01 --return 2025-06-15 \
    --adults 2 --children 1

# Verbose logging to see what's happening
python -m airline_scraper JFK LHR --date 2025-03-20 --return 2025-03-27 -v
```

### All Options

| Flag | Description | Default |
|------|-------------|---------|
| `origin` | Origin IATA code (e.g. JFK) | required |
| `destination` | Destination IATA code (e.g. LAX) | required |
| `--date, -d` | Departure date (YYYY-MM-DD) | required |
| `--return, -r` | Return date (YYYY-MM-DD) | required for round-trip |
| `--one-way` | One-way search | round-trip |
| `--cabin, -c` | economy, premium_economy, business, first | economy |
| `--adults` | Number of adults | 1 |
| `--children` | Number of children | 0 |
| `--max-stops` | Max stops (0=nonstop) | any |
| `--source, -s` | Comma-separated sources | all |
| `--limit, -l` | Max results shown | 20 |
| `--timeout, -t` | Timeout in seconds | 120 |
| `--verbose, -v` | Debug logging | off |

Available sources: `google_flights`, `kayak`, `skyscanner`

## Proxy Configuration

For Kayak and Skyscanner, residential proxies significantly improve success rates. Set them via environment variables or a `.env` file:

```bash
# Single proxy
export PROXY_URL="http://user:pass@proxy.example.com:8080"

# Multiple proxies for rotation
export PROXY_POOL="http://user:pass@proxy1:8080,http://user:pass@proxy2:8080"
```

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

## Anti-Bot Strategy

| Technique | Implementation |
|-----------|---------------|
| **No browser when possible** | Google Flights uses Protobuf encoding via `fast-flights` |
| **Undetected browser** | Patchright patches Chromium to remove automation markers |
| **Human-like behavior** | Random delays, Bezier-curve scrolling, variable typing speed |
| **Cookie persistence** | Kayak reuses browser profiles to keep solved challenge tokens |
| **Proxy rotation** | Residential proxy pool support for IP diversity |
| **Natural navigation** | Visits homepage before search URL to establish cookies |

## Troubleshooting

- **"Anti-bot challenge detected"** — You need a residential proxy. Datacenter IPs are blocked.
- **Kayak returns no results** — Kayak is the most aggressive. Try `--source google_flights` first.
- **Browser crashes in headless mode** — Set `HEADLESS=false` in `.env` to debug visually.
- **Debug screenshots** — When scraping fails, screenshots are saved to `screenshots/`.

## Project Structure

```
airline_scraper/
├── __init__.py
├── __main__.py          # python -m airline_scraper entry point
├── cli.py               # Argument parsing and output formatting
├── models.py            # Data models (SearchRequest, FlightResult, etc.)
├── orchestrator.py      # Runs scrapers concurrently, merges results
├── scrapers/
│   ├── base.py          # Abstract scraper interface
│   ├── google_flights.py # fast-flights + browser fallback
│   ├── kayak.py         # Browser-based with DataDome evasion
│   └── skyscanner.py    # Browser-based scraper
└── utils/
    └── browser.py       # Patchright browser management and human-like actions
```
