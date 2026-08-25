# Cyrune Widgets TODO

This file owns widget implementations, the shared widget SDK, presets, local widget state, and widget-specific provider integrations.

Future network- and native-dependent widgets must use the shared SDK, cache, scheduler, and capability layers. Runtime samples, histories, and view preferences remain local unless the user explicitly shares them.

## Component Versioning

- Introduce an independent semantic Widgets version with one authoritative declaration, a matching component manifest, SDK/catalogue reporting, changelog enforcement, and repository validation without coupling it to Portal releases or individual widget schema versions.

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

## Football Tracker Widget

- when showing match history for teams, add a sort button to allow sorting by oldest first or newest first.
- display any known future matches for that team in each available competition.
- allow teams in table view to marked as tracked. this is for future use for a daily/weekly briefing widgets to show matches. matches for tracked teams could also been shown in the calendar and football tracker widget can send notifications about games.

## Weather Map Widget

- the Hazard map has this neat red marker on the set location. add the same to the weather map.
- make weather map same size as hazard map.

## Weather Widget

- do our sources provide air quality?

## ISS Tracker

- **Bug — globe day/night rendering regression:** the globe and orbit load again on the pinned MapLibre GL JS 5.24 baseline, but the night hemisphere and day/night terminator do not render correctly. The problem occurs at all zoom levels, so do not assume camera zoom is the cause.
  - The pre- and post-migration ISS widget JavaScript/CSS and pinned MapLibre 5.24 assets were verified as byte-identical. Tomorrow's investigation should therefore compare effective runtime state and resource loading, not repeat a source-file diff alone.
  - Reproduce the old checkout and Cyrune widget at the same time, camera position, theme, and follow state in the same Firefox session. Capture console output plus the effective MapLibre style, sources, layers, projection, canvas dimensions, device-pixel ratio, and local storage state.
  - Check migrated resource URLs, script order, browser origin/storage differences between the two `file://` locations, and any persisted widget configuration before changing rendering code again.
  - Keep MapLibre 5.24 and the currently loading globe as the working baseline until a replacement is visually verified.
  - Do not repeat the attempted MapLibre 6.1 ESM upgrade: it failed in direct-file mode and left the globe/orbit engine unavailable.
  - GeoJSON buffer/geometry variations and raster-image globe overlays changed the artifacts without fixing them. The screen-space canvas approach removed the original artifacts but disappeared during interaction and later produced a coarse, pixelated terminator; it was reverted.
- when the widget is set to follow the ISS and the user turns the globe via left mouse button, widget keeps jumping back to ISS location (technically correct). thats a little irritating. i want to drag around sometimes to see the full path of the ISS. Don't let the widget jump back to ISS location while we are still dragging the globe around (while left mouse button is pressed.)
- have a toggle icon underneath zoom controls to toggle light/dark mode without having to open settings modal (implement also in hazard and weather map)

## General

- allow font size changes and other style settings for widgets. a lot of text in the widgets is very small. (New style settings section in Settings)
