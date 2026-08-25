# Cyrune Widgets TODO

This file owns widget implementations, the shared widget SDK, presets, local widget state, and widget-specific provider integrations.

Future network- and native-dependent widgets must use the shared SDK, cache, scheduler, and capability layers. Runtime samples, histories, and view preferences remain local unless the user explicitly shares them.

## Shared Widget Capabilities

- Add reusable widget presets with explicit rules for portable settings, local preferences, credentials, caches, runtime state, scoped export, conflicts, unavailable capabilities, and Undo.
- Add shared Home/Work and similar profiles for location, team, timezone, units, and other cross-widget values, while excluding credentials and machine-local paths.
- Keep all existing widget cache ownership, quota, expiry, instance cleanup, privacy, meaningful-view-state, localStorage, and IndexedDB guarantees through the required-Relay cutover.

## Planned Widgets and Modes

- **Daily Briefing:** configurable Calendar, Weather, Global Hazards, Football, Media Watchlist, RSS, tasks, and service-warning summary that reuses existing caches/services.
- **Clipboard and Snippet Shelf:** explicitly captured text, links, and code with tags, search, expiry, bounded local retention, sanitisation, and permission-denial handling.
- **Habit and Routine Tracker:** daily/weekly targets, streaks, compact history, reminders, and links to existing Sets, sessions, Focus presets, Calendar views, or commands.
- **Local transport departures:** provider-neutral favourite stops, live/scheduled distinction, disruption information, conservative caching, optional location, and attribution.
- **Offline Reading Queue:** extension-assisted sanitised captures with metadata, progress, quotas, duplicate handling, per-item removal, and bounded optional offline content.
- **Kiosk/display mode:** read-only full-screen boards or rotation, schedules, hidden editing controls, reduced background work, burn-in mitigation, and a secure immediate exit.

## Application Launcher Follow-ups

- Consume future Host application discovery without placing native paths in widget/Portal state.
- Preserve explicit picker fallback, portable unbound items, and generic icons when native icon extraction is unavailable.
