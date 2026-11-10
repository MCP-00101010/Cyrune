# Cyrune Widgets TODO


- Monitor 0.6.6: always-visible Activity pies, percentages, Others aggregation and Templates drag/resize/close.

- Monitor 0.6.5: Activity tabs, tracking switch, filtered/chart reports, Focus dial phase and ISS control spacing.

- Monitor 0.6.4: automatic saved postcode display labels and visible light/dark map switching.

- Monitor 0.6.3: Weather-to-Weather-Map following, independent map origins, explicit Cyrune location and locality labels for postcode selections.

- Monitor 0.6.2: full UK postcode lookup, Weather Map/Astronomy Done/Cancel, inherited watch/origin changes, and saved camera restoration.

- Monitor 0.6.1: Templates save/apply/import, Done/Cancel and compact layouts; follow-up findings are recorded in `../Nexus/docs/widget-tidy-review.md`.

- Monitor 0.6.0: Focus Session review after completion/stop, work-phase attribution across pauses/day changes, tracking-off/retention states, persisted review selection and compact board/sidebar rendering.

- Monitor 0.5.0: automatic valid edits, rapid popup changes/close, compact daily controls, sorted categories and independent distraction flags, migration recovery and flag-based budget totals.


- Monitor 0.4.0: whole-domain timer/category/exclusion choices, scheduled and focus blocking, block-page clock access, restart/migration recovery and global activity settings Done/Cancel.


- Monitor 0.3.1: Browser Activity creation/edit settings, Done/Cancel and sidebar placement; creation must leave tracking opt-in unchanged.


- Monitor 0.3.0: shared Focus controls, background phase notifications, restart recovery and explicit legacy adoption; opt-in activity sampling, retention/deletion and compact reporting in board/sidebar layouts. See `../docs/architecture/productivity-services.md`.


- Monitor 0.2.20: the shared provider gateway in Portal Search alongside custom widget aliases and existing local histories.

- Monitor 0.2.19: slow-body timeouts and teardown with multiple active network widgets; verify widgets continue updating after cancelled requests.

- Monitor 0.2.18: coordinated data cutover, current protocol negotiation and first-reload browser upgrades. See `docs/architecture/suite-data-cutover.md` at repository root.

This file owns widget implementations, the shared widget SDK, presets, local widget state, and widget-specific provider integrations.

Future network- and native-dependent widgets must use the shared SDK, cache, scheduler, and capability layers. Runtime samples, histories, and view preferences remain local unless the user explicitly shares them.

## Versioning Follow-up

- Decide whether independently deployed Widgets need their own release versions; the catalogue now has an authoritative component version and Widget descriptors retain their existing schema versions.

## Shared Widget Capabilities

- Add named Home/Work and similar profiles for location, team, timezone, units, and other cross-widget values on top of the implemented global/component Nexus inheritance, while excluding credentials and machine-local paths.
- Keep all existing widget cache ownership, quota, expiry, instance cleanup, privacy, meaningful-view-state, localStorage, and IndexedDB guarantees through the required-Relay cutover.

### Implementation review — 2026-09-14

The SDK already supplies scheduling, bounded network responses, local caches, binary assets, presets, settings inheritance, credential/native/Relay gateways, and notification delivery. Remaining shared work, in suggested order:

1. **Finish SDK lifecycle guarantees.** `_widgetSdkTeardown` invokes cleanup on every full teardown and matches request ownership through a substring of the request key. Track exact instance ownership and disposal state; test repeated teardown, IDs that prefix other IDs, concurrent board/sidebar renders, and disposal during an in-flight request.
2. **Complete capability gateways.** Notification methods currently lack the widget-type declaration check used by the credential and asset gateways. Bind permission, scheduling, publishing and cancellation to the declaring widget and its instance. `geolocation` is advertised and detectable but has no SDK gateway; add bounded, explicit permission-based access with denial handling before any widget starts using browser location.
3. **Add shared read-only summary adapters and subscriptions.** Daily Briefing still reads individual widget globals/caches, and Calendar has its own provider adapters. Define bounded event/task/fixture summaries with stable identity, sport/category, source attribution, freshness/coverage, range queries, and change subscriptions. Keep refresh/network ownership with the source widget. This should support future sports, Countdown participation in Calendar/Briefing, and Habit reminders without adding provider authority to Briefing.
4. **Expand typed preference inheritance.** Weather/Weather Map consume location and units, Astronomy can consume permitted location, and Calendar consumes week start. Add consistent opt-in controls for other applicable time, language, formatting and unit preferences; then layer the named profiles above through Nexus, Relay and Host. Preserve local choices and support missing/unavailable profiles.
5. **Strengthen shared binary-asset ownership.** Asset keys and quotas currently belong to a widget type; quota reads occur before the write transaction. Add explicit instance/shared-asset ownership, reference-aware disposal and transactional quota enforcement, with concurrent-write tests, before new offline-content widgets reuse this store.
6. **Implement portable sync adapters only after the Portal pilot.** The classification, migration and merge work below remains outstanding; presets and browser caches are not a synchronization contract.

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

- Favourite teams can be starred in Table view. Daily Briefing matches all active Tracker favourites against already-loaded Tracker fixture caches, retains today's matches after kickoff, and also includes explicitly configured Calendar football feeds. It never loads team histories or provider data itself; unconfigured competitions can still be absent.
- Monitor provider status vocabularies, club aliases, season rollover metadata, and partial-fallback warnings as upstream APIs evolve. TheSportsDB remains bounded supplemental coverage rather than an authoritative complete season feed; any future provider expansion must retain provider-scoped team IDs, pagination, senior/reserve boundaries, and explicit incomplete-data signalling.
- Investigate whether Daily Briefing settings should eventually offer a provider-backed team search for following teams outside active league widgets. Compare the usefulness against provider-specific team identity, credentials, request cost, rate limits, refresh ownership, stale-data signalling, and the rule that Daily Briefing itself remains a read-only cache consumer rather than gaining network authority. Do not introduce hidden league widgets or a background football service unless this proves worthwhile.
- Remaining extensions are an explicit opt-in Calendar feed and match notifications with bounded lead-time controls.

## ISS Tracker

- Visually verify the clipped 5°×5° night mesh and zero-buffer GeoJSON workaround in Firefox at equinox/solstice times, multiple zooms/cameras, and both themes. The earlier longitude-only strip attempt still produced pole-to-terminator spokes, while the default source buffer triggered MapLibre's documented zoom-dependent duplicate-rendering bug; deterministic seasonal/antimeridian bounds and centre-anchored scroll zoom tests pass, but the in-app browser remained unavailable during the correction.
- Keep pinned MapLibre 5.24 until the night hemisphere and terminator have passed that direct-file visual comparison; do not repeat the failed 6.1 ESM upgrade.

## other widget ideas

- Expand Media Watchlist's existing TMDB-backed upcoming-episode tracking with provider fallbacks only if live coverage proves incomplete; upcoming dates already feed Calendar and Daily Briefing, and opt-in notifications are implemented.
- option to show countdowns in calendar / briefings widgets.
- Portal Search now reuses the Universal Search provider gateway; monitor custom-provider changes, aliases and independent local history while retaining the optional board/sidebar widget.

## Bug monitoring

- Verify Football Tracker against live match-day provider updates: scheduled fixtures now remain in history after kickoff as awaiting an update, completed cup participation stays selectable without upcoming fixtures, and supplemental live/interrupted fixtures are retained. Provider coverage can still be incomplete; the widget must not invent missing results.
- Visually check Daily Briefing's separate Darts/Football sections and several favourite teams in Today and multi-day windows, including board/sidebar layouts. Deterministic regressions cover kickoff, duplicate sources, source toggles, and overlapping tournaments; the in-app browser was unavailable for this pass.
