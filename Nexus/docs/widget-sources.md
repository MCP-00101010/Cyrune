# Widget sources, third-party tools and libraries

This inventory describes the integrations present in the widget catalogue. Provider
names used for setup, credential selection, source filters, data-quality warnings,
map copyright controls and individual image copyright remain meaningful controls
or credits. Routine provider and library footers are collected here instead.

## Online data

| Widgets | Sources | Use |
| --- | --- | --- |
| Weather, Weather Map, Astronomy, Global Hazards | [Open-Meteo](https://open-meteo.com/) | Forecasts, geocoding and optional air quality; air-quality modelling includes [CAMS](https://ads.atmosphere.copernicus.eu/). |
| Weather, Weather Map, Astronomy, Global Hazards | [Postcodes.io](https://postcodes.io/) | Exact full UK postcode coordinates, accepting spaced, compact and lower-case input. Labels use the returned built-up-area/locality name, with administrative-area fallback. City and other postal searches remain with Open-Meteo. |
| Weather Map, ISS Tracker, Global Hazards | [OpenFreeMap](https://openfreemap.org/), [OpenMapTiles](https://openmaptiles.org/), [OpenStreetMap](https://www.openstreetmap.org/copyright) | Basemap styles and map data. In-map copyright controls remain available. |
| ISS Tracker | [Where The ISS At](https://wheretheiss.at/w/developer), [CelesTrak](https://celestrak.org/) | Station observations and orbital elements; local SGP4 propagation. |
| Astronomy | [International Meteor Organization](https://www.imo.net/resources/calendar/), [NASA/LRO](https://science.nasa.gov/resource/moon-mosaic/), [JPL](https://ssd.jpl.nasa.gov/) | Meteor calendar, Moon imagery and bundled comet snapshot. |
| Astronomy Picture of the Day | [NASA APOD API](https://api.nasa.gov/), [APOD](https://apod.nasa.gov/) | Daily media and metadata. Individual copyright belongs to the credited owner; a NASA API response does not imply public-domain rights. |
| Global Hazards | [NASA EONET](https://eonet.gsfc.nasa.gov/), [USGS](https://earthquake.usgs.gov/), [GDACS](https://www.gdacs.org/), [JPL SSD](https://ssd-api.jpl.nasa.gov/), [NOAA SWPC](https://www.swpc.noaa.gov/) | Natural events, earthquakes, alerts, close approaches and optional space-weather data. |
| IP Info | [ipwho.is](https://ipwhois.io/), [ipify](https://www.ipify.org/), [Cloudflare Speed Test](https://speed.cloudflare.com/) | Public exit address, approximate location, fallback address lookup and opt-in connection measurements. Network/ISP identity is user data, distinct from an API credit. |
| Calendar | [GOV.UK bank holidays](https://www.gov.uk/bank-holidays), [Launch Library 2](https://thespacedevs.com/llapi), [football-data.org](https://www.football-data.org/), [PDC](https://www.pdc.tv/tournaments/calendar), [TheSportsDB](https://www.thesportsdb.com/) | Public events and sport feeds, alongside user-configured HTTPS iCalendar/Proton feeds and local Astronomy/Watchlist summaries. |
| Football Tracker | [football-data.org](https://www.football-data.org/), [Sportmonks](https://www.sportmonks.com/), [API-Football](https://www.api-football.com/), [TheSportsDB](https://www.thesportsdb.com/) | Competition coverage, fixtures, standings, team history and bounded supplemental coverage. Coverage and credentials vary by provider. |
| Media Watchlist | [TMDB](https://www.themoviedb.org/), user-selected [Fandom](https://www.fandom.com/) sources | Optional metadata matching and wiki links. This product uses the TMDB API but is not endorsed or certified by TMDB. Manual records work without TMDB. |
| Nexus Mods Tracker | [Nexus Mods API](https://www.nexusmods.com/) | Read-only game/mod metadata and links; no download, install, endorsement or account mutation. |
| RSS Reader, Service Monitor | User-configured HTTPS endpoints | Feed content and bounded service checks. Feed/provider identity remains content, rather than a catalogue credit. |
| Universal Search | User-selected search engines and HTTPS query templates | Explicit navigation. Engine names identify the chosen destination. |

## Bundled tools and libraries

| Tool | Used by | Local notice |
| --- | --- | --- |
| MapLibre GL JS | Weather Map, ISS Tracker, Global Hazards | [License](../../Portal/vendor/maplibre-gl/LICENSE.txt) |
| satellite.js | ISS Tracker orbital propagation | [License](../../Portal/vendor/satellite-js/LICENSE.md), [version](../../Portal/vendor/satellite-js/VERSION) |
| Astronomy Engine | Astronomy and local Calendar astronomy | [License](../../Portal/vendor/astronomy-engine/LICENSE.txt), [version](../../Portal/vendor/astronomy-engine/VERSION.txt) |
| Cloudflare speed-test client | IP Info | [License](../../Portal/vendor/cloudflare-speedtest/LICENSE.txt), [version](../../Portal/vendor/cloudflare-speedtest/VERSION.txt) |
| Mozilla Bergamot Translator | Offline Translator | [Provenance and model handling](../../Portal/vendor/bergamot/NOTICE.md), [MPL 2.0](../../Portal/vendor/bergamot/LICENSE.txt) |

Keep bundled licenses and upstream notices with their distributions. This inventory
does not replace those notices or individual content rights.

## Runtime and data notes

Templates are browser-local presets. Saving/deleting/importing templates changes the
local library immediately; applying one edits the widget settings draft. Done saves
that draft; Cancel restores the widget. Configuration is included by default and
portable content is opt-in. Existing preset files and storage identifiers are retained.

Network requests use declared SDK hosts, bounded responses and local caching.
Credentials remain behind the secure gateway. Translator models are installed on
demand, verified and stored in the local asset cache; translations run locally.
IP speed checks can transfer about 32 MB per run and run at startup, on an IP change,
or on explicit reload, rather than every unchanged-address refresh interval.

Focus and Browser Activity use Relay's browser-local services. Activity excludes
private windows and measures active browser time. Daily totals are retained for
12 months; detail is bounded to 20,000 intervals and totals to 50,000 rows. A detailed
export is bounded to 1,000 intervals per request. The selected date range and optional
site filter apply to export/deletion. Site categories/exclusions/blocking are edited
through Relay's address-bar clock; global tracking preferences are in widget settings.

Native widgets use fixed SDK operations and approved opaque handles. Daily Briefing
aggregates existing state and caches without issuing provider requests. Full ownership
and privacy rules remain in the [SDK reference](../../Widgets/core/sdk/README.md).

Existing postcode location labels resolve to locality names in a bounded per-widget display cache. This lookup leaves portable settings and saved coordinates unchanged.
