"""Generate direct booking/search links for airline aggregator sites.

These links open the site with a pre-filled search, allowing the user
to verify prices and proceed to booking.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from airline_scraper.models import CabinClass, SearchRequest, TripType


def google_flights_link(request: SearchRequest) -> str:
    """Generate a Google Flights search link.

    Google Flights URL format:
    https://www.google.com/travel/flights?q=flights from LHR to BCN on 2025-06-01 return 2025-06-08&curr=GBP
    """
    dep = request.departure_date.strftime("%Y-%m-%d")
    q = f"flights from {request.origin} to {request.destination} on {dep}"
    if request.return_date and request.trip_type == TripType.ROUND_TRIP:
        ret = request.return_date.strftime("%Y-%m-%d")
        q += f" return {ret}"
    # Passengers
    if request.adults > 1:
        q += f" {request.adults} adults"
    if request.children > 0:
        q += f" {request.children} children"
    # Cabin class
    cabin_map = {
        CabinClass.BUSINESS: " business class",
        CabinClass.FIRST: " first class",
        CabinClass.PREMIUM_ECONOMY: " premium economy",
    }
    q += cabin_map.get(request.cabin_class, "")

    q_encoded = q.replace(" ", "+")
    url = f"https://www.google.com/travel/flights?q={q_encoded}&curr={request.currency}"
    if request.max_stops is not None:
        url += f"&stops={request.max_stops}"
    return url


def kayak_link(request: SearchRequest) -> str:
    """Generate a Kayak search link.

    Kayak URL format:
    https://www.kayak.com/flights/LHR-BCN/2025-06-01/2025-06-08?sort=price_a&fs=cabin=e
    """
    dep = request.departure_date.strftime("%Y-%m-%d")
    cabin_map = {
        CabinClass.ECONOMY: "e",
        CabinClass.PREMIUM_ECONOMY: "p",
        CabinClass.BUSINESS: "b",
        CabinClass.FIRST: "f",
    }
    cabin = cabin_map.get(request.cabin_class, "e")

    if request.return_date and request.trip_type == TripType.ROUND_TRIP:
        ret = request.return_date.strftime("%Y-%m-%d")
        url = (
            f"https://www.kayak.com/flights/"
            f"{request.origin}-{request.destination}/"
            f"{dep}/{ret}"
            f"?sort=price_a&fs=cabin={cabin}"
        )
    else:
        url = (
            f"https://www.kayak.com/flights/"
            f"{request.origin}-{request.destination}/"
            f"{dep}"
            f"?sort=price_a&fs=cabin={cabin}"
        )

    url += f"&currency={request.currency}"
    if request.max_stops is not None:
        url += f";stops={request.max_stops}"
    return url


def skyscanner_link(request: SearchRequest) -> str:
    """Generate a Skyscanner search link.

    Skyscanner URL format:
    https://www.skyscanner.com/transport/flights/lhr/bcn/250601/250608/?adultsv2=1&cabinclass=economy&currency=gbp
    """
    dep = request.departure_date.strftime("%y%m%d")
    cabin_map = {
        CabinClass.ECONOMY: "economy",
        CabinClass.PREMIUM_ECONOMY: "premiumeconomy",
        CabinClass.BUSINESS: "business",
        CabinClass.FIRST: "first",
    }
    cabin = cabin_map.get(request.cabin_class, "economy")
    currency = request.currency.lower()

    if request.return_date and request.trip_type == TripType.ROUND_TRIP:
        ret = request.return_date.strftime("%y%m%d")
        url = (
            f"https://www.skyscanner.com/transport/flights/"
            f"{request.origin.lower()}/{request.destination.lower()}/"
            f"{dep}/{ret}/"
            f"?adultsv2={request.adults}"
            f"&cabinclass={cabin}"
            f"&currency={currency}"
        )
    else:
        url = (
            f"https://www.skyscanner.com/transport/flights/"
            f"{request.origin.lower()}/{request.destination.lower()}/"
            f"{dep}/"
            f"?adultsv2={request.adults}"
            f"&cabinclass={cabin}"
            f"&currency={currency}"
            f"&rtn=0"
        )

    if request.children:
        url += "&childrenv2=" + "%7C".join(["8"] * request.children)
    if request.max_stops is not None:
        if request.max_stops == 0:
            url += "&stops=direct"
        elif request.max_stops == 1:
            url += "&stops=!twoPlusStops"
    return url


def generate_booking_link(request: SearchRequest, source: str) -> str:
    """Generate a booking link for a given source.

    Args:
        request: The search parameters.
        source: One of 'google_flights', 'kayak', 'skyscanner'.

    Returns:
        A URL string that opens the site with a pre-filled search.
    """
    generators = {
        "google_flights": google_flights_link,
        "kayak": kayak_link,
        "skyscanner": skyscanner_link,
    }
    gen = generators.get(source)
    if gen:
        return gen(request)
    return ""
