"""Untrusted provider text and media projection into the bounded metadata schema."""
from __future__ import annotations
import re
from arcade_core.library import Game
from arcade_core.tosec import clean_metadata_text, normalize_title
from arcade_core.screenscraper import media_reference as screenscraper_media_reference

def simplified_scrape_title(title: str) -> str:
    text = re.sub(r"\bv\d+(?:\.\d+)*\b", "", title, flags=re.IGNORECASE)
    text = re.sub(r"\b(?:demo|preview|beta|alpha|final|release|remake)\b$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip(" -_")
    return text

def screenscraper_candidate(game_data: dict, provider: dict[str, object]) -> dict[str, str]:
    language = str(provider.get("preferred_language") or "en").lower()
    region = str(provider.get("preferred_region") or "wor").lower()
    title = choose_localized_text(game_data.get("noms"), region, language) or clean_metadata_text(game_data.get("nom", ""))
    date = choose_localized_text(game_data.get("dates"), region, language) or clean_metadata_text(game_data.get("date", ""))
    publisher = nested_text(game_data.get("editeur")) or nested_text(game_data.get("publisher"))
    genre = choose_genre(game_data.get("genres"), language)
    description = choose_localized_text(game_data.get("synopsis"), region, language, max_len=2000) or choose_localized_text(game_data.get("descriptif"), region, language, max_len=2000)
    return {
        "title": title,
        "year": extract_year(date),
        "publisher": publisher,
        "developer": nested_text(game_data.get("developpeur")),
        "players": nested_text(game_data.get("joueurs")),
        "platform": nested_text(game_data.get("systeme")),
        "genre": genre,
        "description": description,
        "screenshot": "",
        "loading_screen": "",
    }

def screenscraper_confidence(game: Game, candidate: dict[str, str], search_term=None) -> int:
    score = 20
    title = normalize_title(candidate.get("title", ""))
    source = normalize_title(search_term if search_term is not None else game.title)
    if title and title == source:
        score += 55
    elif title and source and (title in source or source in title):
        score += 15
    if candidate.get("year") and gameYear_py(candidate.get("year")) == gameYear_py(game.year):
        score += 15
    if candidate.get("publisher") and normalize_title(candidate.get("publisher", "")) == normalize_title(game.publisher):
        score += 10
    return max(0, min(100, score))

def gameYear_py(value: str) -> str:
    match = re.search(r"\d{4}|19XX|20XX", str(value or ""), re.IGNORECASE)
    return match.group(0).upper() if match else ""

def extract_year(value: object) -> str:
    return gameYear_py(str(value or ""))

def nested_text(value: object, max_len: int = 160) -> str:
    from arcade_core.scrape_text import text
    return text(value, max_len)

def choose_localized_text(value: object, region: str = "wor", language: str = "en", max_len: int = 160) -> str:
    from arcade_core.scrape_text import localized
    return localized(value, region, language, max_len)

def choose_genre(value: object, language: str = "en") -> str:
    rows = value if isinstance(value, list) else []
    if isinstance(value, dict):
        rows = [value]
    for row in rows:
        if not isinstance(row, dict):
            continue
        text = choose_localized_text(row.get("noms") or row.get("genres"), language=language)
        if text:
            return text
        for key in ("text", "nomcourt", "nom"):
            if row.get(key):
                return clean_metadata_text(row.get(key), max_len=80)
    return ""

def screenscraper_assets(game_data: dict, provider: dict[str, object]) -> dict[str, str]:
    language = str(provider.get("preferred_language") or "en").lower()
    region = str(provider.get("preferred_region") or "wor").lower()
    return {
        "screenshot": screenscraper_media_reference(game_data, ("ss",), region, language),
        "loading_screen": screenscraper_media_reference(game_data, ("box-2D", "box-2D-front", "box-3D", "sstitle"), region, language),
    }
