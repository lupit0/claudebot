"""Base scraper interface."""

from __future__ import annotations

import abc
import logging
from typing import Optional

from airline_scraper.models import FlightResult, SearchRequest

logger = logging.getLogger(__name__)


class BaseScraper(abc.ABC):
    """Abstract base class for all flight scrapers."""

    name: str = "base"

    @abc.abstractmethod
    async def search(self, request: SearchRequest) -> list[FlightResult]:
        """Search for flights matching the request.

        Returns a list of FlightResult sorted by price (cheapest first).
        """
        ...

    async def close(self):
        """Clean up resources."""
        pass
