# Cyrune Widgets TODO

This file owns widget implementations, the shared widget SDK, presets, local widget state, and widget-specific provider integrations.

Future network- and native-dependent widgets must use the shared SDK, cache, scheduler, and capability layers. Runtime samples, histories, and view preferences remain local unless the user explicitly shares them.

## Component Versioning

- Introduce an independent semantic Widgets version with one authoritative declaration, a matching component manifest, SDK/catalogue reporting, changelog enforcement, and repository validation without coupling it to Portal releases or individual widget schema versions.
- should every widget have its own versioning?

## Shared Widget Capabilities

- Add reusable widget presets with explicit rules for portable settings, local preferences, credentials, caches, runtime state, scoped export, conflicts, unavailable capabilities, and Undo.
- Add named Home/Work and similar profiles for location, team, timezone, units, and other cross-widget values on top of the implemented global/component Nexus inheritance, while excluding credentials and machine-local paths.
- Keep all existing widget cache ownership, quota, expiry, instance cleanup, privacy, meaningful-view-state, localStorage, and IndexedDB guarantees through the required-Relay cutover.

## Planned Widgets and Modes

- **Daily Briefing:** configurable Calendar, Weather, Global Hazards, Football, Media Watchlist, RSS, tasks, and service-warning summary that reuses existing caches/services. (option for weekly briefingor next x days days)
- **Clipboard and Snippet Shelf:** explicitly captured text, links, and code with tags, search, expiry, bounded local retention, sanitisation, and permission-denial handling.
- **Habit and Routine Tracker:** daily/weekly targets, streaks, compact history, reminders, and links to existing Sets, sessions, Focus presets, Calendar views, or commands.
- **Local transport departures:** provider-neutral favourite stops, live/scheduled distinction, disruption information, conservative caching, optional location, and attribution.
- **Offline Reading Queue:** extension-assisted sanitised captures with metadata, progress, quotas, duplicate handling, per-item removal, and bounded optional offline content.
- **Kiosk/display mode:** read-only full-screen boards or rotation, schedules, hidden editing controls, reduced background work, burn-in mitigation, and a secure immediate exit.

## Calculator & Converter

- Extend Calculator & Converter with Frankfurter daily exchange rates, a searchable base/target currency picker, a displayed rate timestamp, and clear source attribution.
- Cache the latest successful rates locally for offline reuse, refresh no more than daily unless explicitly requested, and keep the provider behind an adapter so a public or self-hosted endpoint can be substituted later.
- Review the terms and attribution requirements of Frankfurter's underlying institutional rate sources before any commercial release; test unsupported currencies, stale rates, provider failure, rounding, and migration of existing Calculator configurations.

## Calendar

- Add optional country- and region-specific public holidays generated locally through `date-holidays`, alongside existing provider holidays and user events.
- Produce a reduced browser dataset containing only selected countries or lazy-load bounded regional data instead of shipping the complete approximately 1.5 MB bundle to every user.
- Preserve the package's ISC notice and holiday data's CC BY-SA attribution, distinguish public/bank/observance and substitute days, and test timezone boundaries, regional overrides, duplicates, language selection, and calendar export.

## Lexicon Widget

- Add a combined Dictionary and Thesaurus widget backed locally by Princeton WordNet, with definitions, parts of speech, synonyms, antonyms, example usage, and semantic relationships available offline.
- Offer optional Datamuse enrichment for ranked related words, spelling suggestions, autocomplete, rhymes, and sound-alikes; send only an explicitly searched word or phrase and expose an offline-only setting.
- Let Translator open a selected source or translated term in Lexicon without coupling either widget's core operation to the other, and keep provider adapters ready for Datamuse's announced 2027 API-key change.
- Retain WordNet's licence notice, acknowledge Datamuse in any public build, bound local indexes and query caches, and test missing senses, morphology, multiword input, unsupported languages, offline operation, stale enrichment, and provider failure.

## Football Tracker Widget

- allow tracking/teams in table view. this is for future use for a daily/weekly briefing widgets to show matches. matches for tracked teams could also been shown in the calendar and football tracker widget can send notifications about games.

## ISS Tracker

- **Bug — globe day/night rendering regression:** the globe and orbit load again on the pinned MapLibre GL JS 5.24 baseline, but the night hemisphere and day/night terminator do not render correctly. The problem occurs at all zoom levels, so do not assume camera zoom is the cause.
  - The pre- and post-migration ISS widget JavaScript/CSS and pinned MapLibre 5.24 assets were verified as byte-identical. Tomorrow's investigation should therefore compare effective runtime state and resource loading, not repeat a source-file diff alone.
  - Reproduce the old checkout and Cyrune widget at the same time, camera position, theme, and follow state in the same Firefox session. Capture console output plus the effective MapLibre style, sources, layers, projection, canvas dimensions, device-pixel ratio, and local storage state.
  - Check migrated resource URLs, script order, browser origin/storage differences between the two `file://` locations, and any persisted widget configuration before changing rendering code again.
  - Keep MapLibre 5.24 and the currently loading globe as the working baseline until a replacement is visually verified.
  - Do not repeat the attempted MapLibre 6.1 ESM upgrade: it failed in direct-file mode and left the globe/orbit engine unavailable.
  - GeoJSON buffer/geometry variations and raster-image globe overlays changed the artifacts without fixing them. The screen-space canvas approach removed the original artifacts but disappeared during interaction and later produced a coarse, pixelated terminator; it was reverted.
- have a toggle icon underneath zoom controls to toggle light/dark mode without having to open settings modal (implement also in hazard and weather map)

## General

- allow font size changes and other style settings for widgets. a lot of text in the widgets is very small. (New style settings section in Settings)

## other widget ideas

- tv series tracker, send notifications when new episode is available - can also feed into daily briefings. what is a good online source to find relevant information?
- option to show countdowns in calendar / briefings widgets.
- should the universal search widget be fused into the hubs search function as they provide very similar functionality? should we offer a search bar build directly into the hub ui?
-
