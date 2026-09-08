"""Plain provider text and one authoritative title-match classification."""
import html
import math
import re
import unicodedata


def text(value, limit=160):
    if isinstance(value, dict):
        value = next((value[key] for key in ('text', 'nom', 'name') if value.get(key)), '')
    if not isinstance(value, str):
        return ''
    return re.sub(r'\s+', ' ', html.unescape(value)).strip()[:limit]


def localized(value, region='wor', language='en', limit=160):
    rows = value if isinstance(value, list) else [value]
    for key, preferences in (
        ('region', [region, 'wor', 'eu', 'us', 'gb', 'ss', 'jp', 'fr', 'de']),
        ('langue', [language, 'en', 'de', 'fr']),
        ('language', [language, 'en', 'de', 'fr']),
    ):
        for preference in preferences:
            for row in rows:
                if isinstance(row, dict) and str(row.get(key, '')).lower() == preference:
                    result = text(row, limit)
                    if result:
                        return result
    return next((result for row in rows if (result := text(row, limit))), '')


def title_key(value):
    value = unicodedata.normalize('NFKC', str(value)).casefold().replace('&', ' and ')
    value = re.sub(r"['`’]", '', value)
    value = ''.join(c if c.isalnum() else ' ' for c in value)
    return re.sub(r'^(the|a|an) | (the|a|an)$', '', ' '.join(value.split()))


def review(result):
    matches = []
    for match in result.get('matches', []):
        try:
            score = float(match.get('confidence', 0))
            if isinstance(match.get('candidate'), dict) and math.isfinite(score):
                matches.append((score, title_key(match['candidate'].get('title', ''))))
        except (AttributeError, TypeError, ValueError):
            continue
    matches.sort(reverse=True)
    if not matches:
        return True, 'No usable match'
    if len(matches) == 1 and matches[0][0] == 100 and any(row.get('identity') == 'rom-sha1' for row in result.get('matches', [])):
        return False, 'Exact cartridge SHA-1 match'
    if matches[0][0] < 75 or not matches[0][1] or matches[0][1] != title_key(result.get('query', {}).get('search_term', '')):
        return True, 'Review the title before applying'
    if len(matches) > 1 and matches[0][0] == matches[1][0]:
        return True, 'Several results have the same score'
    return False, 'Exact title match'
