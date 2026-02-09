"""Data models for flight search requests and results."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Optional


class CabinClass(Enum):
    ECONOMY = "economy"
    PREMIUM_ECONOMY = "premium_economy"
    BUSINESS = "business"
    FIRST = "first"


class TripType(Enum):
    ONE_WAY = "one_way"
    ROUND_TRIP = "round_trip"


class Source(Enum):
    GOOGLE_FLIGHTS = "google_flights"
    KAYAK = "kayak"
    SKYSCANNER = "skyscanner"
    RYANAIR = "ryanair"


@dataclass
class SearchRequest:
    """A flight search query."""

    origin: str  # IATA code, e.g. "JFK"
    destination: str  # IATA code, e.g. "LAX"
    departure_date: date
    return_date: Optional[date] = None
    trip_type: TripType = TripType.ROUND_TRIP
    cabin_class: CabinClass = CabinClass.ECONOMY
    adults: int = 1
    children: int = 0
    currency: str = "GBP"  # ISO 4217 currency code
    max_stops: Optional[int] = None  # None = any, 0 = nonstop only

    def __post_init__(self):
        self.origin = self.origin.upper().strip()
        self.destination = self.destination.upper().strip()
        if len(self.origin) != 3 or len(self.destination) != 3:
            raise ValueError("Origin and destination must be 3-letter IATA codes")
        if self.trip_type == TripType.ROUND_TRIP and self.return_date is None:
            raise ValueError("Round trip requires a return date")
        if self.return_date and self.return_date < self.departure_date:
            raise ValueError("Return date must be after departure date")


@dataclass
class FlightLeg:
    """A single leg of a flight (e.g., outbound or return)."""

    departure_airport: str
    arrival_airport: str
    departure_time: Optional[datetime] = None
    arrival_time: Optional[datetime] = None
    airline: str = ""
    flight_number: str = ""
    duration_minutes: Optional[int] = None
    stops: int = 0
    stop_airports: list[str] = field(default_factory=list)


@dataclass
class FlightResult:
    """A complete flight search result."""

    price: float
    currency: str = "GBP"
    outbound: Optional[FlightLeg] = None
    return_leg: Optional[FlightLeg] = None
    source: Source = Source.GOOGLE_FLIGHTS
    deep_link: str = ""
    fetched_at: datetime = field(default_factory=datetime.now)

    @property
    def price_display(self) -> str:
        symbol = {
            "USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥",
            "CAD": "CA$", "AUD": "A$", "CHF": "CHF ", "INR": "₹",
        }.get(self.currency, self.currency + " ")
        return f"{symbol}{self.price:,.0f}"

    @property
    def outbound_summary(self) -> str:
        if not self.outbound:
            return "N/A"
        leg = self.outbound
        stops_str = "nonstop" if leg.stops == 0 else f"{leg.stops} stop{'s' if leg.stops > 1 else ''}"
        duration_str = ""
        if leg.duration_minutes:
            h, m = divmod(leg.duration_minutes, 60)
            duration_str = f" ({h}h {m}m)"
        return f"{leg.airline} {leg.departure_airport}→{leg.arrival_airport} {stops_str}{duration_str}"
