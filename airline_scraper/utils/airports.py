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


def format_airport_display(code: str) -> str:
    """Format an airport code with its city name for display.

    Returns e.g. "LHR (London Heathrow, UK)" or just "XYZ" if unknown.
    """
    info = AIRPORT_INFO.get(code.upper())
    if info:
        name, country = info
        return f"{code.upper()} ({name}, {country})"
    return code.upper()
