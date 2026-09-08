"""TOSEC text parsing and filename construction; no runtime or filesystem authority."""
from pathlib import Path
import re

LANGUAGE_NAMES = {
    "AR": "Arabic",
    "CS": "Czech",
    "DA": "Danish",
    "DE": "German",
    "EL": "Greek",
    "EN": "English",
    "ES": "Spanish",
    "FI": "Finnish",
    "FR": "French",
    "HR": "Croatian",
    "HU": "Hungarian",
    "IT": "Italian",
    "JA": "Japanese",
    "KO": "Korean",
    "NL": "Dutch",
    "NO": "Norwegian",
    "PL": "Polish",
    "PT": "Portuguese",
    "RO": "Romanian",
    "RU": "Russian",
    "SK": "Slovak",
    "SV": "Swedish",
    "TR": "Turkish",
    "UZ": "Uzbek",
}

COUNTRY_NAMES = {
    "BR": "Brazil",
    "CA": "Canada",
    "CZ": "Czech Republic",
    "DE": "Germany",
    "ES": "Spain",
    "FR": "France",
    "GB": "United Kingdom",
    "GR": "Greece",
    "HR": "Croatia",
    "HU": "Hungary",
    "IT": "Italy",
    "JP": "Japan",
    "NL": "Netherlands",
    "PL": "Poland",
    "PT": "Portugal",
    "RO": "Romania",
    "RU": "Russia",
    "SK": "Slovakia",
    "TR": "Turkey",
    "US": "United States",
    "UZ": "Uzbekistan",
}

COUNTRY_TO_DEFAULT_LANGUAGE = {
    "BR": "PT",
    "CZ": "CS",
    "DE": "DE",
    "ES": "ES",
    "FR": "FR",
    "GR": "EL",
    "HR": "HR",
    "HU": "HU",
    "IT": "IT",
    "JP": "JA",
    "NL": "NL",
    "PL": "PL",
    "PT": "PT",
    "RO": "RO",
    "RU": "RU",
    "SK": "SK",
    "TR": "TR",
    "UZ": "UZ",
}

LANGUAGE_ALIASES = {
    "gr": "EL",
    "jp": "JA",
}

ARTICLE_SUFFIX_TO_PREFIX = {
    "a": "A",
    "an": "An",
    "the": "The",
    "de": "De",
    "het": "Het",
    "der": "Der",
    "die": "Die",
    "das": "Das",
    "le": "Le",
    "la": "La",
    "les": "Les",
    "l'": "L'",
    "el": "El",
    "los": "Los",
    "las": "Las",
    "il": "Il",
    "lo": "Lo",
    "gli": "Gli",
    "i": "I",
}

ARTICLE_PREFIXES = tuple(sorted((value for value in ARTICLE_SUFFIX_TO_PREFIX.values() if value != "I"), key=len, reverse=True))

def is_placeholder_metadata_value(value: object) -> bool:
    return str(value or "").strip() in {"", "-", "?"}

def parse_tosec_name(file_name: str) -> dict[str, object]:
    stem = Path(file_name).stem
    parentheses = re.findall(r"\(([^()]*)\)", stem)
    brackets = re.findall(r"\[([^\[\]]*)\]", stem)
    tosec_title = re.split(r"\s+\(", stem, maxsplit=1)[0].strip() or stem
    title = display_title_from_tosec(tosec_title)
    year = ""
    publisher = ""
    languages: list[str] = []
    countries: list[str] = []
    systems: list[str] = []

    for i, tag in enumerate(parentheses):
        clean = tag.strip()
        upper = clean.upper()
        system = parse_system_tag(clean)
        if system:
            systems.append(system)
        if not year and re.fullmatch(r"\d{4}(?:-\d{2}(?:-\d{2})?)?|19XX|20XX", upper):
            year = clean
            if i + 1 < len(parentheses):
                candidate = parentheses[i + 1].strip()
                if not is_placeholder_metadata_value(candidate):
                    publisher = candidate
            continue
        language = parse_language_tag(clean)
        country = parse_country_tag(clean)
        if language and is_metadata_tag(clean):
            languages.extend(language)
        if country and is_metadata_tag(clean):
            countries.extend(country)

    for tag in brackets:
        language = parse_language_tag(tag)
        country = parse_country_tag(tag)
        if language and is_metadata_tag(tag):
            languages.extend(language)
        if country and is_metadata_tag(tag):
            countries.extend(country)

    return {
        "title": title,
        "tosec_title": tosec_title,
        "sort_title": article_sort_title(title),
        "year": year,
        "publisher": publisher,
        "system": " / ".join(dedupe(systems)),
        "languages": tuple(dedupe(languages)),
        "countries": tuple(dedupe(countries)),
        "parentheses": tuple(parentheses),
        "brackets": tuple(brackets),
    }

def display_title_from_tosec(title: str) -> str:
    text = re.sub(r"\s+", " ", title).strip()
    match = re.match(r"^(.+),\s*([A-Za-z]+'?)$", text)
    if not match:
        return text
    base = match.group(1).strip()
    suffix = match.group(2).strip().lower()
    article = ARTICLE_SUFFIX_TO_PREFIX.get(suffix)
    if not article:
        return text
    if article.endswith("'"):
        return f"{article}{base}"
    return f"{article} {base}"

def tosec_title_from_display(title: str) -> str:
    text = re.sub(r"\s+", " ", title).strip()
    for article in ARTICLE_PREFIXES:
        pattern = rf"(?i)^{re.escape(article)}(?:\s+|(?=[A-Z0-9]))(.+)$" if article.endswith("'") else rf"(?i)^{re.escape(article)}\s+(.+)$"
        match = re.match(pattern, text)
        if not match:
            continue
        base = match.group(1).strip()
        if not base:
            return text
        suffix = article
        return f"{base}, {suffix}"
    return text

def article_sort_title(title: str) -> str:
    text = display_title_from_tosec(title)
    for article in ARTICLE_PREFIXES:
        pattern = rf"(?i)^{re.escape(article)}(?:\s+|(?=[A-Z0-9]))(.+)$" if article.endswith("'") else rf"(?i)^{re.escape(article)}\s+(.+)$"
        match = re.match(pattern, text)
        if match:
            return match.group(1).strip() or text
    return text

def parse_system_tag(tag: str) -> str:
    normalized = tag.strip().upper().replace(" ", "")
    if re.fullmatch(r"(?:16|48|128)K", normalized):
        return normalized
    if re.fullmatch(r"(?:16|48|128)K-(?:16|48|128)K", normalized):
        return normalized
    return ""

def parse_language_tag(tag: str) -> list[str]:
    codes: list[str] = []
    for token in re.split(r"[-_,+/ ]+", tag.strip()):
        if not token:
            continue
        if not token.islower():
            continue
        lower = token.lower()
        upper = LANGUAGE_ALIASES.get(lower, lower.upper())
        if upper in LANGUAGE_NAMES:
            codes.append(upper)
    return codes

def is_metadata_tag(tag: str) -> bool:
    tokens = [token for token in re.split(r"[-_,+/ ]+", tag.strip()) if token]
    if not tokens:
        return False
    return all(is_language_token(token) or is_country_token(token) for token in tokens)

def is_language_token(token: str) -> bool:
    if not token.islower():
        return False
    upper = LANGUAGE_ALIASES.get(token.lower(), token.upper())
    return upper in LANGUAGE_NAMES

def is_country_token(token: str) -> bool:
    return len(token) == 2 and token.isupper() and token in COUNTRY_NAMES

def parse_country_tag(tag: str) -> list[str]:
    countries: list[str] = []
    for token in re.split(r"[-_,+/ ]+", tag.strip()):
        if len(token) != 2 or not token.isupper():
            continue
        if token in COUNTRY_NAMES:
            countries.append(token)
    return countries

def parse_report_language(value: str) -> list[str]:
    if not value:
        return []
    return parse_language_tag(value)

def format_languages(codes: tuple[str, ...] | list[str]) -> str:
    if not codes:
        return ""
    return " / ".join(LANGUAGE_NAMES.get(code, code) for code in codes)

def dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result

def folder_letter(title: str) -> str:
    normalized = normalize_title(article_sort_title(title))
    if not normalized:
        return "0-9"
    first = normalized[0].upper()
    return first if "A" <= first <= "Z" else "0-9"

def normalize_title(title: str) -> str:
    import re

    text = article_sort_title(title).lower().replace("&", " and ")
    text = re.sub(r"['`]", "", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()

def build_tosec_file_name(source: Path, item: dict, old_title: str) -> str:
    title = clean_file_name(tosec_title_from_display(str(item.get("title") or old_title))) or source.stem
    tags = build_tosec_tags(source, item)
    flags = build_tosec_flags(item)
    suffix = source.suffix
    version = clean_file_name(str(item.get("version", "")))
    demo = clean_file_name(str(item.get("demo", "")))
    title_version = f"{title} {version}".strip() if version else title
    raw_tag_text = "".join(f"({clean_file_name(tag)})" for tag in tags if clean_file_name(tag))
    tag_text = f" {raw_tag_text}" if raw_tag_text else ""
    if demo:
        tag_text = f" ({demo}){tag_text}"
    flag_text = "".join(f"[{clean_file_name(flag)}]" for flag in flags if clean_file_name(flag))
    return f"{title_version}{tag_text}{flag_text}{suffix}"

def build_tosec_tags(source: Path, item: dict) -> list[str]:
    parsed = parse_tosec_name(source.name)
    existing = list(item.get("tosec_tags") or parsed["parentheses"])
    old_year = str(parsed.get("year") or "").strip()
    old_publisher = str(parsed.get("publisher") or "").strip()
    managed: list[str] = []
    for tag in existing:
        clean = str(tag).strip()
        if is_placeholder_metadata_value(clean):
            continue
        if old_year and clean == old_year:
            continue
        if old_publisher and clean == old_publisher:
            continue
        if parse_system_tag(clean) or is_metadata_tag(clean) or clean.lower() == "ulaplus":
            continue
        if clean in {
            str(item.get("video", "")),
            str(item.get("copyright_status", "")),
            str(item.get("development_status", "")),
            str(item.get("media_type", "")),
            str(item.get("media_label", "")),
            str(item.get("demo", "")),
        }:
            continue
        managed.append(clean)

    tags: list[str] = []
    if item.get("year"):
        tags.append(str(item["year"]))
    if item.get("publisher"):
        tags.append(str(item["publisher"]))
    if item.get("system"):
        tags.append(str(item["system"]).upper())
    if item.get("video"):
        tags.append(str(item["video"]).upper())
    countries = normalize_code_values(item.get("countries", []), COUNTRY_NAMES)
    languages = normalize_code_values(item.get("languages", []), LANGUAGE_NAMES)
    if countries:
        tags.append("-".join(countries))
    if languages:
        tags.append("-".join(code.lower() for code in languages))
    for key in ("copyright_status", "development_status", "media_type", "media_label"):
        if item.get(key):
            tags.append(str(item[key]))
    if any(str(value).lower() == "ulaplus" for value in item.get("hardware", [])):
        tags.append("ULAPlus")
    tags.extend(managed)
    return dedupe(tags)

def build_tosec_flags(item: dict) -> list[str]:
    existing = [str(flag).strip() for flag in item.get("flags", []) if str(flag).strip()]
    explicit = normalize_text_list(item.get("dump_flags", [])) + normalize_text_list(item.get("more_info", []))
    return dedupe(explicit or existing)

def clean_metadata_text(value: object, default: str = "", max_len: int = 120, allow_empty: bool = True) -> str:
    text = str(value if value is not None else default).strip()
    text = re.sub(r"\s+", " ", text)
    if not text and not allow_empty:
        text = default
    return text[:max_len]

def normalize_code_values(value: object, allowed: dict[str, str]) -> list[str]:
    if isinstance(value, str):
        raw_values = re.split(r"[,;/\s]+", value)
    elif isinstance(value, list | tuple):
        raw_values = [str(item) for item in value]
    else:
        raw_values = []
    codes: list[str] = []
    for raw in raw_values:
        code = raw.strip().upper()
        if not code:
            continue
        if code in allowed:
            codes.append(code)
    return dedupe(codes)

def normalize_text_list(value: object) -> list[str]:
    if isinstance(value, str):
        raw_values = re.split(r"[,;]+", value)
    elif isinstance(value, list | tuple):
        raw_values = [str(item) for item in value]
    else:
        raw_values = []
    return dedupe([clean_metadata_text(item, max_len=60) for item in raw_values if clean_metadata_text(item)])

def clean_file_name(name: str) -> str:
    cleaned = name.strip().replace("/", "-").replace("\\", "-")
    cleaned = cleaned.strip(" .")
    for char in '<>:"|?*':
        cleaned = cleaned.replace(char, "-")
    return cleaned
