"""Airport and city name resolution.

Maps city names to IATA airport codes and vice versa. Supports multiple
airports per city (e.g., London → LHR, LGW, STN, LTN, SEN).
"""

from __future__ import annotations

from typing import Optional

# City name → list of IATA codes (first is the "main" airport)
# This covers major cities worldwide. Add more as needed.
CITY_TO_AIRPORTS: dict[str, list[str]] = {
    # UK & Ireland
    "london": ["LHR", "LGW", "STN", "LTN", "SEN", "LCY"],
    "manchester": ["MAN"],
    "birmingham": ["BHX"],
    "edinburgh": ["EDI"],
    "glasgow": ["GLA"],
    "bristol": ["BRS"],
    "liverpool": ["LPL"],
    "newcastle": ["NCL"],
    "belfast": ["BFS", "BHD"],
    "leeds": ["LBA"],
    "cardiff": ["CWL"],
    "dublin": ["DUB"],
    # Europe
    "paris": ["CDG", "ORY", "BVA"],
    "rome": ["FCO", "CIA"],
    "milan": ["MXP", "LIN", "BGY"],
    "barcelona": ["BCN"],
    "madrid": ["MAD"],
    "amsterdam": ["AMS"],
    "berlin": ["BER"],
    "munich": ["MUC"],
    "frankfurt": ["FRA"],
    "hamburg": ["HAM"],
    "dusseldorf": ["DUS"],
    "zurich": ["ZRH"],
    "geneva": ["GVA"],
    "vienna": ["VIE"],
    "brussels": ["BRU", "CRL"],
    "lisbon": ["LIS"],
    "porto": ["OPO"],
    "athens": ["ATH"],
    "copenhagen": ["CPH"],
    "stockholm": ["ARN", "BMA"],
    "oslo": ["OSL"],
    "helsinki": ["HEL"],
    "prague": ["PRG"],
    "budapest": ["BUD"],
    "warsaw": ["WAW", "WMI"],
    "bucharest": ["OTP"],
    "istanbul": ["IST", "SAW"],
    "nice": ["NCE"],
    "lyon": ["LYS"],
    "naples": ["NAP"],
    "venice": ["VCE"],
    "florence": ["FLR"],
    "malaga": ["AGP"],
    "palma": ["PMI"],
    "ibiza": ["IBZ"],
    "seville": ["SVQ"],
    "valencia": ["VLC"],
    "dubrovnik": ["DBV"],
    "split": ["SPU"],
    "reykjavik": ["KEF"],
    # North America
    "new york": ["JFK", "EWR", "LGA"],
    "nyc": ["JFK", "EWR", "LGA"],
    "los angeles": ["LAX"],
    "la": ["LAX"],
    "chicago": ["ORD", "MDW"],
    "san francisco": ["SFO"],
    "sf": ["SFO"],
    "miami": ["MIA", "FLL"],
    "boston": ["BOS"],
    "washington": ["IAD", "DCA", "BWI"],
    "dc": ["IAD", "DCA", "BWI"],
    "seattle": ["SEA"],
    "dallas": ["DFW", "DAL"],
    "houston": ["IAH", "HOU"],
    "atlanta": ["ATL"],
    "denver": ["DEN"],
    "las vegas": ["LAS"],
    "phoenix": ["PHX"],
    "orlando": ["MCO"],
    "detroit": ["DTW"],
    "minneapolis": ["MSP"],
    "philadelphia": ["PHL"],
    "toronto": ["YYZ", "YTZ"],
    "montreal": ["YUL"],
    "vancouver": ["YVR"],
    "mexico city": ["MEX"],
    "cancun": ["CUN"],
    # Asia
    "tokyo": ["NRT", "HND"],
    "osaka": ["KIX"],
    "seoul": ["ICN", "GMP"],
    "beijing": ["PEK", "PKX"],
    "shanghai": ["PVG", "SHA"],
    "hong kong": ["HKG"],
    "singapore": ["SIN"],
    "bangkok": ["BKK", "DMK"],
    "kuala lumpur": ["KUL"],
    "taipei": ["TPE"],
    "delhi": ["DEL"],
    "mumbai": ["BOM"],
    "dubai": ["DXB", "DWC"],
    "abu dhabi": ["AUH"],
    "doha": ["DOH"],
    "riyadh": ["RUH"],
    "tel aviv": ["TLV"],
    "jakarta": ["CGK"],
    "manila": ["MNL"],
    "hanoi": ["HAN"],
    "ho chi minh": ["SGN"],
    "bali": ["DPS"],
    # Oceania
    "sydney": ["SYD"],
    "melbourne": ["MEL"],
    "brisbane": ["BNE"],
    "perth": ["PER"],
    "auckland": ["AKL"],
    # Africa
    "cairo": ["CAI"],
    "johannesburg": ["JNB"],
    "cape town": ["CPT"],
    "nairobi": ["NBO"],
    "marrakech": ["RAK"],
    "casablanca": ["CMN"],
    # South America
    "sao paulo": ["GRU", "CGH"],
    "rio de janeiro": ["GIG", "SDU"],
    "buenos aires": ["EZE", "AEP"],
    "bogota": ["BOG"],
    "lima": ["LIM"],
    "santiago": ["SCL"],
    # Caribbean
    "kingston": ["KIN"],
    "nassau": ["NAS"],
    "barbados": ["BGI"],
    "punta cana": ["PUJ"],
}

# IATA code → (city name, country)
AIRPORT_INFO: dict[str, tuple[str, str]] = {
    # UK & Ireland
    "LHR": ("London Heathrow", "UK"),
    "LGW": ("London Gatwick", "UK"),
    "STN": ("London Stansted", "UK"),
    "LTN": ("London Luton", "UK"),
    "SEN": ("London Southend", "UK"),
    "LCY": ("London City", "UK"),
    "MAN": ("Manchester", "UK"),
    "BHX": ("Birmingham", "UK"),
    "EDI": ("Edinburgh", "UK"),
    "GLA": ("Glasgow", "UK"),
    "BRS": ("Bristol", "UK"),
    "LPL": ("Liverpool", "UK"),
    "NCL": ("Newcastle", "UK"),
    "BFS": ("Belfast International", "UK"),
    "BHD": ("Belfast City", "UK"),
    "LBA": ("Leeds Bradford", "UK"),
    "CWL": ("Cardiff", "UK"),
    "DUB": ("Dublin", "Ireland"),
    # Europe
    "CDG": ("Paris Charles de Gaulle", "France"),
    "ORY": ("Paris Orly", "France"),
    "BVA": ("Paris Beauvais", "France"),
    "NCE": ("Nice", "France"),
    "LYS": ("Lyon", "France"),
    "FCO": ("Rome Fiumicino", "Italy"),
    "CIA": ("Rome Ciampino", "Italy"),
    "MXP": ("Milan Malpensa", "Italy"),
    "LIN": ("Milan Linate", "Italy"),
    "BGY": ("Milan Bergamo", "Italy"),
    "NAP": ("Naples", "Italy"),
    "VCE": ("Venice", "Italy"),
    "FLR": ("Florence", "Italy"),
    "BCN": ("Barcelona", "Spain"),
    "MAD": ("Madrid", "Spain"),
    "AGP": ("Malaga", "Spain"),
    "PMI": ("Palma de Mallorca", "Spain"),
    "IBZ": ("Ibiza", "Spain"),
    "SVQ": ("Seville", "Spain"),
    "VLC": ("Valencia", "Spain"),
    "AMS": ("Amsterdam", "Netherlands"),
    "BER": ("Berlin", "Germany"),
    "MUC": ("Munich", "Germany"),
    "FRA": ("Frankfurt", "Germany"),
    "HAM": ("Hamburg", "Germany"),
    "DUS": ("Dusseldorf", "Germany"),
    "ZRH": ("Zurich", "Switzerland"),
    "GVA": ("Geneva", "Switzerland"),
    "VIE": ("Vienna", "Austria"),
    "BRU": ("Brussels", "Belgium"),
    "CRL": ("Brussels Charleroi", "Belgium"),
    "LIS": ("Lisbon", "Portugal"),
    "OPO": ("Porto", "Portugal"),
    "ATH": ("Athens", "Greece"),
    "CPH": ("Copenhagen", "Denmark"),
    "ARN": ("Stockholm Arlanda", "Sweden"),
    "BMA": ("Stockholm Bromma", "Sweden"),
    "OSL": ("Oslo", "Norway"),
    "HEL": ("Helsinki", "Finland"),
    "PRG": ("Prague", "Czech Republic"),
    "BUD": ("Budapest", "Hungary"),
    "WAW": ("Warsaw Chopin", "Poland"),
    "WMI": ("Warsaw Modlin", "Poland"),
    "OTP": ("Bucharest", "Romania"),
    "IST": ("Istanbul", "Turkey"),
    "SAW": ("Istanbul Sabiha", "Turkey"),
    "DBV": ("Dubrovnik", "Croatia"),
    "SPU": ("Split", "Croatia"),
    "KEF": ("Reykjavik Keflavik", "Iceland"),
    # North America
    "JFK": ("New York JFK", "USA"),
    "EWR": ("New York Newark", "USA"),
    "LGA": ("New York LaGuardia", "USA"),
    "LAX": ("Los Angeles", "USA"),
    "ORD": ("Chicago O'Hare", "USA"),
    "MDW": ("Chicago Midway", "USA"),
    "SFO": ("San Francisco", "USA"),
    "MIA": ("Miami", "USA"),
    "FLL": ("Fort Lauderdale", "USA"),
    "BOS": ("Boston", "USA"),
    "IAD": ("Washington Dulles", "USA"),
    "DCA": ("Washington Reagan", "USA"),
    "BWI": ("Baltimore/Washington", "USA"),
    "SEA": ("Seattle", "USA"),
    "DFW": ("Dallas/Fort Worth", "USA"),
    "DAL": ("Dallas Love Field", "USA"),
    "IAH": ("Houston Intercontinental", "USA"),
    "HOU": ("Houston Hobby", "USA"),
    "ATL": ("Atlanta", "USA"),
    "DEN": ("Denver", "USA"),
    "LAS": ("Las Vegas", "USA"),
    "PHX": ("Phoenix", "USA"),
    "MCO": ("Orlando", "USA"),
    "DTW": ("Detroit", "USA"),
    "MSP": ("Minneapolis", "USA"),
    "PHL": ("Philadelphia", "USA"),
    "YYZ": ("Toronto Pearson", "Canada"),
    "YTZ": ("Toronto Island", "Canada"),
    "YUL": ("Montreal", "Canada"),
    "YVR": ("Vancouver", "Canada"),
    "MEX": ("Mexico City", "Mexico"),
    "CUN": ("Cancun", "Mexico"),
    # Asia
    "NRT": ("Tokyo Narita", "Japan"),
    "HND": ("Tokyo Haneda", "Japan"),
    "KIX": ("Osaka Kansai", "Japan"),
    "ICN": ("Seoul Incheon", "South Korea"),
    "GMP": ("Seoul Gimpo", "South Korea"),
    "PEK": ("Beijing Capital", "China"),
    "PKX": ("Beijing Daxing", "China"),
    "PVG": ("Shanghai Pudong", "China"),
    "SHA": ("Shanghai Hongqiao", "China"),
    "HKG": ("Hong Kong", "China"),
    "SIN": ("Singapore", "Singapore"),
    "BKK": ("Bangkok Suvarnabhumi", "Thailand"),
    "DMK": ("Bangkok Don Mueang", "Thailand"),
    "KUL": ("Kuala Lumpur", "Malaysia"),
    "TPE": ("Taipei", "Taiwan"),
    "DEL": ("Delhi", "India"),
    "BOM": ("Mumbai", "India"),
    "DXB": ("Dubai", "UAE"),
    "DWC": ("Dubai World Central", "UAE"),
    "AUH": ("Abu Dhabi", "UAE"),
    "DOH": ("Doha", "Qatar"),
    "RUH": ("Riyadh", "Saudi Arabia"),
    "TLV": ("Tel Aviv", "Israel"),
    "CGK": ("Jakarta", "Indonesia"),
    "DPS": ("Bali Denpasar", "Indonesia"),
    "MNL": ("Manila", "Philippines"),
    "HAN": ("Hanoi", "Vietnam"),
    "SGN": ("Ho Chi Minh City", "Vietnam"),
    # Oceania
    "SYD": ("Sydney", "Australia"),
    "MEL": ("Melbourne", "Australia"),
    "BNE": ("Brisbane", "Australia"),
    "PER": ("Perth", "Australia"),
    "AKL": ("Auckland", "New Zealand"),
    # Africa
    "CAI": ("Cairo", "Egypt"),
    "JNB": ("Johannesburg", "South Africa"),
    "CPT": ("Cape Town", "South Africa"),
    "NBO": ("Nairobi", "Kenya"),
    "RAK": ("Marrakech", "Morocco"),
    "CMN": ("Casablanca", "Morocco"),
    # South America
    "GRU": ("Sao Paulo Guarulhos", "Brazil"),
    "CGH": ("Sao Paulo Congonhas", "Brazil"),
    "GIG": ("Rio de Janeiro Galeao", "Brazil"),
    "SDU": ("Rio de Janeiro Santos Dumont", "Brazil"),
    "EZE": ("Buenos Aires Ezeiza", "Argentina"),
    "AEP": ("Buenos Aires Aeroparque", "Argentina"),
    "BOG": ("Bogota", "Colombia"),
    "LIM": ("Lima", "Peru"),
    "SCL": ("Santiago", "Chile"),
    # Caribbean
    "KIN": ("Kingston", "Jamaica"),
    "NAS": ("Nassau", "Bahamas"),
    "BGI": ("Barbados", "Barbados"),
    "PUJ": ("Punta Cana", "Dominican Republic"),
}


def _build_name_to_code_map() -> dict[str, str]:
    """Build a reverse lookup from airport name keywords to IATA codes.

    Enables lookups like "London Gatwick" → LGW, "Heathrow" → LHR,
    "Narita" → NRT, "JFK" → JFK, etc.
    """
    name_map: dict[str, str] = {}
    for code, (name, _country) in AIRPORT_INFO.items():
        # Full name: "London Heathrow" → LHR
        name_map[name.lower()] = code
        # Individual words (skip very short/generic ones)
        for word in name.split():
            w = word.lower().strip("()/")
            if len(w) >= 4 and w not in {"city", "international", "field", "world", "central"}:
                # Only set if not already mapped (first code wins for ambiguous words)
                if w not in name_map:
                    name_map[w] = code
    return name_map


_NAME_TO_CODE: dict[str, str] = _build_name_to_code_map()


def resolve_airport(input_str: str) -> tuple[str, Optional[str]]:
    """Resolve a city name, airport name, or airport code to an IATA code.

    Args:
        input_str: One of:
            - 3-letter IATA code (e.g., "LHR")
            - City name (e.g., "London", "New York", "paris")
            - Airport name (e.g., "London Gatwick", "Heathrow", "Narita")

    Returns:
        Tuple of (IATA code, warning message or None).
        If the input is a city with multiple airports, uses the main one
        and returns a warning listing the alternatives.

    Raises:
        ValueError: If the input cannot be resolved.
    """
    cleaned = input_str.strip()

    # If it's already a 3-letter code, accept it directly
    if len(cleaned) == 3 and cleaned.isalpha():
        return cleaned.upper(), None

    lower = cleaned.lower()

    # Try to match as a city name FIRST (e.g., "London" → LHR with multi-airport warning)
    # This must come before airport name matching so "London" shows all airports,
    # not just matching "London Heathrow".
    city_key = lower
    if city_key in CITY_TO_AIRPORTS:
        airports = CITY_TO_AIRPORTS[city_key]
        main = airports[0]
        warning = None
        if len(airports) > 1:
            alts = [f"{c} ({get_airport_name(c)})" for c in airports[1:]]
            main_name = get_airport_name(main)
            # Build a context-specific tip using this city's second airport
            alt_name = get_airport_name(airports[1])
            warning = (
                f'"{cleaned}" has multiple airports. '
                f"Using {main} ({main_name}). "
                f"Alternatives: {', '.join(alts)}. "
                f'Tip: use a specific name (e.g., "{alt_name}") or '
                f"IATA code (e.g., {airports[1]}) to pick just one."
            )
        return main, warning

    # Try to match as a specific airport name (e.g. "London Gatwick" → LGW, "Heathrow" → LHR)
    if lower in _NAME_TO_CODE:
        code = _NAME_TO_CODE[lower]
        name = get_airport_name(code)
        return code, f'Matched "{cleaned}" to {code} ({name})'

    # Try partial matching on city names (e.g., "san fran" matches "san francisco")
    for city, airports in CITY_TO_AIRPORTS.items():
        if city.startswith(city_key) or city_key in city:
            main = airports[0]
            main_name = get_airport_name(main)
            warning = None
            if len(airports) > 1:
                alts = [f"{c} ({get_airport_name(c)})" for c in airports[1:]]
                warning = (
                    f'Matched "{cleaned}" to {city.title()}. '
                    f"Using {main} ({main_name}). "
                    f"Alternatives: {', '.join(alts)}. "
                    f'Tip: use a specific name (e.g., "{city.title()} {get_airport_name(airports[1]).split()[-1]}") '
                    f"or IATA code (e.g., {airports[1]}) to pick one."
                )
            else:
                warning = f'Matched "{cleaned}" to {city.title()} ({main})'
            return main, warning

    # Try partial matching on airport names
    for name_key, code in _NAME_TO_CODE.items():
        if city_key in name_key or name_key.startswith(city_key):
            name = get_airport_name(code)
            return code, f'Matched "{cleaned}" to {code} ({name})'

    raise ValueError(
        f'Could not resolve "{cleaned}" to an airport. '
        f"Use a 3-letter IATA code (e.g., LHR), a city name (e.g., London), "
        f'or an airport name (e.g., "London Gatwick", "Heathrow").'
    )


def resolve_all_airports(input_str: str) -> tuple[list[str], Optional[str]]:
    """Resolve a city name to ALL its airports (for multi-airport search).

    For a city like London, returns all 6 airports instead of just LHR.
    For a specific airport name or IATA code, returns just that one.

    Returns:
        Tuple of (list of IATA codes, info message or None).
    """
    cleaned = input_str.strip()

    # If it's a 3-letter code, return just that
    if len(cleaned) == 3 and cleaned.isalpha():
        return [cleaned.upper()], None

    lower = cleaned.lower()

    # City name check FIRST — "London" should return all London airports
    if lower in CITY_TO_AIRPORTS:
        airports = CITY_TO_AIRPORTS[lower]
        if len(airports) > 1:
            names = [f"{c} ({get_airport_name(c)})" for c in airports]
            msg = f'"{cleaned}" has {len(airports)} airports: {", ".join(names)}. Searching all.'
            return airports, msg
        return airports, None

    # Specific airport name (e.g. "London Gatwick" → just LGW)
    if lower in _NAME_TO_CODE:
        code = _NAME_TO_CODE[lower]
        return [code], f'Matched "{cleaned}" to {code} ({get_airport_name(code)})'

    # Fall back to single resolve
    code, warning = resolve_airport(input_str)
    return [code], warning


def get_airport_name(code: str) -> str:
    """Get the display name for an airport code."""
    info = AIRPORT_INFO.get(code.upper())
    if info:
        return info[0]
    return code.upper()


def get_airport_city_country(code: str) -> tuple[str, str]:
    """Get (city/airport name, country) for an airport code."""
    info = AIRPORT_INFO.get(code.upper())
    if info:
        return info
    return (code.upper(), "")


# Approximate airport coordinates (lat, lon) for distance-based stop validation.
# Only needs to be roughly correct — used to estimate max plausible nonstop time.
AIRPORT_COORDS: dict[str, tuple[float, float]] = {
    # UK & Ireland
    "LHR": (51.47, -0.46), "LGW": (51.15, -0.19), "STN": (51.89, 0.26),
    "LTN": (51.87, -0.37), "SEN": (51.57, 0.70), "LCY": (51.51, 0.05),
    "MAN": (53.35, -2.27), "BHX": (52.45, -1.75), "EDI": (55.95, -3.37),
    "GLA": (55.87, -4.43), "BRS": (51.38, -2.72), "LPL": (53.33, -2.85),
    "NCL": (55.04, -1.69), "BFS": (54.66, -6.22), "BHD": (54.62, -5.87),
    "LBA": (53.87, -1.66), "CWL": (51.40, -3.34), "DUB": (53.43, -6.27),
    # Europe
    "CDG": (49.01, 2.55), "ORY": (48.72, 2.36), "BVA": (49.45, 2.11),
    "FCO": (41.80, 12.25), "CIA": (41.80, 12.59), "MXP": (45.63, 8.72),
    "LIN": (45.45, 9.28), "BGY": (45.67, 9.70), "BCN": (41.30, 2.08),
    "MAD": (40.47, -3.57), "AMS": (52.31, 4.77), "BER": (52.37, 13.52),
    "MUC": (48.35, 11.79), "FRA": (50.03, 8.57), "HAM": (53.63, 9.99),
    "DUS": (51.29, 6.77), "ZRH": (47.46, 8.55), "GVA": (46.24, 6.11),
    "VIE": (48.11, 16.57), "BRU": (50.90, 4.48), "CRL": (50.46, 4.45),
    "LIS": (38.77, -9.13), "OPO": (41.24, -8.68), "ATH": (37.94, 23.94),
    "CPH": (55.62, 12.66), "ARN": (59.65, 17.94), "BMA": (59.35, 17.94),
    "OSL": (60.19, 11.10), "HEL": (60.32, 24.96), "PRG": (50.10, 14.26),
    "BUD": (47.44, 19.26), "WAW": (52.17, 20.97), "WMI": (52.45, 20.65),
    "OTP": (44.57, 26.08), "IST": (41.26, 28.74), "SAW": (40.90, 29.31),
    "NCE": (43.66, 7.22), "LYS": (45.73, 5.08), "NAP": (40.88, 14.29),
    "VCE": (45.51, 12.35), "FLR": (43.81, 11.20), "AGP": (36.67, -4.49),
    "PMI": (39.55, 2.74), "IBZ": (38.87, 1.37), "SVQ": (37.42, -5.89),
    "VLC": (39.49, -0.47), "DBV": (42.56, 18.27), "SPU": (43.54, 16.30),
    "KEF": (63.99, -22.62),
    # North America
    "JFK": (40.64, -73.78), "EWR": (40.69, -74.17), "LGA": (40.78, -73.87),
    "LAX": (33.94, -118.41), "ORD": (41.97, -87.91), "MDW": (41.79, -87.75),
    "SFO": (37.62, -122.38), "MIA": (25.80, -80.29), "FLL": (26.07, -80.15),
    "BOS": (42.36, -71.01), "IAD": (38.94, -77.46), "DCA": (38.85, -77.04),
    "BWI": (39.18, -76.67), "SEA": (47.45, -122.31), "DFW": (32.90, -97.04),
    "DAL": (32.85, -96.85), "IAH": (29.98, -95.34), "HOU": (29.65, -95.28),
    "ATL": (33.64, -84.43), "DEN": (39.86, -104.67), "LAS": (36.08, -115.15),
    "PHX": (33.43, -112.01), "MCO": (28.43, -81.31), "DTW": (42.21, -83.35),
    "MSP": (44.88, -93.22), "PHL": (39.87, -75.24),
    "YYZ": (43.68, -79.63), "YTZ": (43.63, -79.40), "YUL": (45.47, -73.74),
    "YVR": (49.19, -123.18), "MEX": (19.44, -99.07), "CUN": (21.04, -86.87),
    # Asia
    "NRT": (35.76, 140.39), "HND": (35.55, 139.78), "KIX": (34.43, 135.24),
    "ICN": (37.46, 126.44), "GMP": (37.56, 126.79),
    "PEK": (40.08, 116.58), "PKX": (39.51, 116.41),
    "PVG": (31.14, 121.81), "SHA": (31.20, 121.34),
    "HKG": (22.31, 113.91), "SIN": (1.36, 103.99),
    "BKK": (13.69, 100.75), "DMK": (13.91, 100.61),
    "KUL": (2.74, 101.70), "TPE": (25.08, 121.23),
    "DEL": (28.56, 77.10), "BOM": (19.09, 72.87),
    "DXB": (25.25, 55.36), "DWC": (24.90, 55.16),
    "AUH": (24.43, 54.65), "DOH": (25.26, 51.61),
    "RUH": (24.96, 46.70), "TLV": (32.01, 34.89),
    "CGK": (-6.13, 106.66), "DPS": (-8.75, 115.17),
    "MNL": (14.51, 121.02), "HAN": (21.22, 105.81), "SGN": (10.82, 106.65),
    # Oceania
    "SYD": (-33.95, 151.18), "MEL": (-37.67, 144.84),
    "BNE": (-27.38, 153.12), "PER": (-31.94, 115.97), "AKL": (-37.01, 174.79),
    # Africa
    "CAI": (30.12, 31.41), "JNB": (-26.14, 28.25), "CPT": (-33.96, 18.60),
    "NBO": (-1.32, 36.93), "RAK": (31.61, -8.04), "CMN": (33.37, -7.59),
    # South America
    "GRU": (-23.43, -46.47), "CGH": (-23.63, -46.66),
    "GIG": (-22.81, -43.25), "SDU": (-22.91, -43.16),
    "EZE": (-34.82, -58.54), "AEP": (-34.56, -58.42),
    "BOG": (4.70, -74.15), "LIM": (-12.02, -77.11), "SCL": (-33.39, -70.79),
    # Caribbean
    "KIN": (17.94, -76.79), "NAS": (25.04, -77.47),
    "BGI": (13.07, -59.49), "PUJ": (18.57, -68.36),
    # Santiago de Compostela (from the bug report example)
    "SCQ": (42.90, -8.42),
}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in km."""
    import math
    R = 6371  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def estimate_max_nonstop_minutes(origin: str, destination: str) -> Optional[int]:
    """Estimate the maximum plausible nonstop flight time between two airports.

    Uses great-circle distance + generous buffer for wind, routing, taxiing.
    Returns None if coordinates aren't available for either airport.

    The formula:
        - Average cruise speed: ~850 km/h
        - Add 30 min for takeoff/climb/descent/taxi
        - Add 25% buffer for headwinds and routing
        - Result is the MAXIMUM plausible nonstop time
    """
    c1 = AIRPORT_COORDS.get(origin.upper())
    c2 = AIRPORT_COORDS.get(destination.upper())
    if not c1 or not c2:
        return None

    distance_km = _haversine_km(c1[0], c1[1], c2[0], c2[1])
    cruise_speed_kmh = 850
    flight_hours = distance_km / cruise_speed_kmh
    flight_minutes = flight_hours * 60
    # Add 45 min for takeoff/landing/taxi + 30% buffer for headwinds/routing
    max_minutes = int(flight_minutes * 1.30 + 45)
    return max_minutes


def validate_stops(
    stops: int,
    duration_minutes: Optional[int],
    origin: str,
    destination: str,
) -> int:
    """Validate and correct the stop count using duration-based heuristics.

    If a flight is marked as nonstop (stops=0) but its duration far exceeds
    the maximum plausible nonstop time for the route, override to 1+ stops.
    This catches cases where the regex-based stop detection is fooled by
    page text containing "nonstop" or "direct" in unrelated contexts.

    Returns the corrected stop count.
    """
    if stops > 0 or duration_minutes is None:
        # Only validate nonstop claims; if stops>0 already, trust it
        return stops

    max_nonstop = estimate_max_nonstop_minutes(origin, destination)
    if max_nonstop is None:
        # No coordinate data — can't validate, trust the parser
        return stops

    if duration_minutes > max_nonstop:
        # Duration exceeds max plausible nonstop time — this has stops
        return 1

    return stops


def format_airport_display(code: str) -> str:
    """Format an airport code with its city name for display.

    Returns e.g. "LHR (London Heathrow, UK)" or just "XYZ" if unknown.
    """
    info = AIRPORT_INFO.get(code.upper())
    if info:
        name, country = info
        return f"{code.upper()} ({name}, {country})"
    return code.upper()
