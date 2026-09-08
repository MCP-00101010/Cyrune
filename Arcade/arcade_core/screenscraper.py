"""ScreenScraper API v2 media references, without credential-bearing URLs.

API contract: https://www.screenscraper.fr/webapi2.php (checked 2026-09-08).
"""

import re
import time
from collections import deque
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler
from arcade_core.scrape_platforms import platform_override
from arcade_core.platforms import provider_platform


ART_PREFIX = "scraper-artwork/screenscraper/"
ART_PATTERN = re.compile(
    re.escape(ART_PREFIX) + r"([1-9][0-9]{0,8})/([1-9][0-9]{0,11})/"
    r"(ss|sstitle|box-2D|box-3D|box-2D-front)/([a-z0-9-]{1,12}|none)"
)
API_HOSTS = {"api.screenscraper.fr", "www.screenscraper.fr", "screenscraper.fr",
             "neoclone.screenscraper.fr"}


def artwork_parts(value):
    match = ART_PATTERN.fullmatch(value) if isinstance(value, str) else None
    return match.groups() if match else None


def system_id(game, provider):
    override = platform_override(provider, "screenscraper")
    if override is not None:
        return override
    return provider_platform(game, 'screenscraper', provider)


def media_reference(game_data, types, region, language):
    medias = game_data.get("medias")
    if not isinstance(medias, list):
        return ""
    system = game_data.get("systeme")
    system = str(system.get("id") or "") if isinstance(system, dict) else ""
    game_id = str(game_data.get("id") or game_data.get("gameid") or "")
    regions = list(dict.fromkeys([region, "wor", "eu", "us", "gb", "ss", "jp", "fr", "de"]))
    languages = list(dict.fromkeys([language, "en", "fr", "de"]))
    matches = []
    for row in medias:
        if not isinstance(row, dict) or row.get("type") not in types or not row.get("url"):
            continue
        # The API's URL contains passwords. Never forward, persist or fetch it;
        # reconstruct the documented mediaJeu request from bounded public IDs.
        media_type = row["type"]
        media_region = str(row.get("region") or "").lower()
        media_language = str(row.get("langue") or row.get("language") or "").lower()
        reference = f"{ART_PREFIX}{system}/{game_id}/{media_type}/{media_region or 'none'}"
        if not artwork_parts(reference):
            continue
        rank = (types.index(media_type), regions.index(media_region) if media_region in regions else len(regions),
                languages.index(media_language) if media_language in languages else len(languages))
        matches.append((rank, reference))
    return min(matches, key=lambda item: item[0])[1] if matches else ""


class ScreenScraperRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        old, new = urlsplit(req.full_url), urlsplit(newurl)
        try:
            allowed = (new.scheme == "https" and not new.username and not new.password
                       and new.port in (None, 443) and not new.fragment
                       and "\\" not in newurl
                       and (new.hostname == old.hostname or
                            old.hostname in API_HOSTS and new.hostname in API_HOSTS))
        except ValueError:
            allowed = False
        if not allowed:
            raise ValueError("ScreenScraper redirected to an unsupported origin")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class QuotaPause(ValueError):
    def __init__(self, message, retry_after):
        super().__init__(message)
        self.retry_after = max(1, int(retry_after))


class RequestQuota:
    """Bound requests using API account limits; never sleep inside native RPC."""

    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.requests = deque(maxlen=10000)
        self.per_minute = 60
        self.pause_until = 0
        self.pause_reason = ""

    def before_request(self):
        now = self.clock()
        if now < self.pause_until:
            raise QuotaPause(self.pause_reason, self.pause_until - now + 1)
        while self.requests and self.requests[0] <= now - 60:
            self.requests.popleft()
        if len(self.requests) >= self.per_minute:
            raise QuotaPause("ScreenScraper minute quota reached; waiting to retry.", self.requests[0] + 61 - now)
        self.requests.append(now)

    def failed(self, code):
        if code in (429, 430, 431):
            seconds = 60 if code == 429 else 3600
            self.pause_until = self.clock() + seconds
            self.pause_reason = ("ScreenScraper request limit reached; wait one minute before retrying."
                                 if code == 429 else "ScreenScraper daily quota reached; retry after the provider resets it.")

    def update(self, user):
        if not isinstance(user, dict):
            return
        def number(key):
            text = str(user.get(key, ""))
            return int(text) if text.isascii() and text.isdigit() and len(text) <= 9 else None
        per_minute = number("maxrequestspermin") or number("maxrequestsperdmin")
        if per_minute:
            self.per_minute = min(per_minute, 10000)
        for used_key, max_key, code in (("requeststoday", "maxrequestsperday", 430),
                                        ("requestskotoday", "maxrequestskoperday", 431)):
            used, maximum = number(used_key), number(max_key)
            if maximum and used is not None and used >= maximum:
                self.failed(code)
