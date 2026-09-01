# Cyrune Widgets TODO

This file owns widget implementations, the shared widget SDK, presets, local widget state, and widget-specific provider integrations.

Future network- and native-dependent widgets must use the shared SDK, cache, scheduler, and capability layers. Runtime samples, histories, and view preferences remain local unless the user explicitly shares them.

## Versioning Follow-up

- Decide whether independently deployed Widgets need their own release versions; the catalogue now has an authoritative component version and Widget descriptors retain their existing schema versions.

## Shared Widget Capabilities

- Add named Home/Work and similar profiles for location, team, timezone, units, and other cross-widget values on top of the implemented global/component Nexus inheritance, while excluding credentials and machine-local paths.
- Keep all existing widget cache ownership, quota, expiry, instance cleanup, privacy, meaningful-view-state, localStorage, and IndexedDB guarantees through the required-Relay cutover.

## Portable Remote Sync Participation

- Join project-wide remote sync only after the Portal workflow is proven. Extend Widget descriptors with an explicit sync classification so portable user-authored content can opt in while caches, provider responses, histories, notification state, view state, browser IDs, IndexedDB assets, credentials, and machine-local data remain local by default.
- Define versioned per-widget export/import/merge adapters rather than synchronising browser storage wholesale. Widget instances must retain stable portable identities, bounded payloads, deterministic serialization, deletion tombstones, schema migration, and safe behaviour when a widget type or newer schema is unavailable on another device.
- Start with a low-risk user-content Widget such as Notes or a future Habit/Snippet Widget. Test two-device edits, deletion versus modification, duplicate instances, missing providers, offline use, quota limits, disabled sync, instance disposal, and rollback before allowing additional Widget types to participate.

## Planned Widgets and Modes

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

- Favourite teams can now be starred in Table view and their upcoming matches feed Daily Briefing. For now, Briefing deliberately shows only favourites backed by active Football Tracker league widgets and their already-loaded fixture cache.
- Monitor provider status vocabularies, club aliases, season rollover metadata, and partial-fallback warnings as upstream APIs evolve. TheSportsDB remains bounded supplemental coverage rather than an authoritative complete season feed; any future provider expansion must retain provider-scoped team IDs, pagination, senior/reserve boundaries, and explicit incomplete-data signalling.
- Investigate whether Daily Briefing settings should eventually offer a provider-backed team search for following teams outside active league widgets. Compare the usefulness against provider-specific team identity, credentials, request cost, rate limits, refresh ownership, stale-data signalling, and the rule that Daily Briefing itself remains a read-only cache consumer rather than gaining network authority. Do not introduce hidden league widgets or a background football service unless this proves worthwhile.
- Remaining extensions are an explicit opt-in Calendar feed and match notifications with bounded lead-time controls.

## ISS Tracker

- Visually verify the clipped 5°×5° night mesh and zero-buffer GeoJSON workaround in Firefox at equinox/solstice times, multiple zooms/cameras, and both themes. The earlier longitude-only strip attempt still produced pole-to-terminator spokes, while the default source buffer triggered MapLibre's documented zoom-dependent duplicate-rendering bug; deterministic seasonal/antimeridian bounds and centre-anchored scroll zoom tests pass, but the in-app browser remained unavailable during the correction.
- Keep pinned MapLibre 5.24 until the night hemisphere and terminator have passed that direct-file visual comparison; do not repeat the failed 6.1 ESM upgrade.
- have a toggle icon underneath zoom controls to toggle light/dark mode without having to open settings modal (implement also in hazard and weather map)

## other widget ideas

- Expand Media Watchlist's existing TMDB-backed upcoming-episode tracking with provider fallbacks only if live coverage proves incomplete; upcoming dates already feed Calendar and Daily Briefing, and opt-in notifications are implemented.
- option to show countdowns in calendar / briefings widgets.
- should the universal search widget be fused into the hubs search function as they provide very similar functionality? should we offer a search bar build directly into the hub ui?
-
