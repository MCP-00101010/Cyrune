# Cyrune Nexus Contract

This document defines the durable ownership, settings, status, and security boundaries for Cyrune Nexus. It supplements `component-boundaries.md` and records the first implemented Relay and Host contract.

## Product Role

Nexus is Cyrune's local control centre. It owns project-status aggregation and presentation, shared-settings schemas and management, sanitized validation receipts, and its own cached view state. Its direct `file://` interface must remain useful when privileged services are missing so it can help diagnose Portal, Relay, Host, and other components.

Nexus does not own another component's business data. It may summarize allowlisted metadata about Portal databases, Arcade libraries, Widgets, Relay, Host, and the repository, but it does not edit those sources through its status interface.

## Authority Flow

```text
Nexus file page
  -> exact authenticated Nexus role in Relay
    -> fixed-purpose, independently validated Host operations
      -> Nexus settings / sanitized metadata / allowlisted project documents

Portal or Arcade file page
  -> its own exact authenticated Relay role
    -> one fixed Host-owned component settings profile
      -> typed effective subset, value sources, and revision (no caller-selected paths or keys)
```

Nexus never receives a general filesystem path, shell, Git command, database query, credential, process, or native-operation interface. Relay binds every page request to the exact registered Nexus URL, tab, role, and opaque session. Host independently validates operation names, component IDs, document types, bounds, revisions, and approved roots.

The status product is read-only. Shared settings are the first Nexus-owned mutation surface and use revision-aware atomic persistence, validation, retained backups, bounded change history, schema migration, and fixed sparse component overrides.

## Implemented Operations

The page-to-Relay message allowlist is `MW_NEXUS_PING`, `MW_NEXUS_GET_SETTINGS`, `MW_NEXUS_SAVE_SETTINGS`, `MW_NEXUS_GET_STATUS`, `MW_NEXUS_GET_DOCUMENT`, `MW_NEXUS_OPEN_TODO`, and `MW_NEXUS_CHECK_REMOTE`. Relay maps these to fixed Host operations after exact-role authorization. Settings payloads are bounded to 64 KiB by Relay; documents are selected only by component/document type and bounded to 512 KiB by Host. The remote check accepts no page parameters: Host derives the current checkout branch and compares it only with fixed `origin`.

`MW_NEXUS_SAVE_SETTINGS` includes the complete candidate snapshot and `expectedRevision`. A successful response includes the saved snapshot and changed-key metadata. A stale write returns `conflict: true` with the current authoritative snapshot so the page can reload instead of overwriting it. Relay broadcasts only the new numeric revision to authenticated Nexus, Portal, and Arcade pages.

`MW_NEXUS_GET_SETTINGS` may also return the bounded settings-history journal. History records contain only revision, update time, and validated changed setting paths; values, credentials, native targets, and arbitrary messages are forbidden.

Portal uses `MW_GET_CYRUNE_SETTINGS`, which Relay maps to the fixed Host `portal-widgets` profile. Arcade currently uses the retained compatibility message `MW_EMUGUI_GET_CYRUNE_SETTINGS`, mapped to `arcade`; new application code contains that legacy name only inside its isolated transport adapter. Host owns both allowlists and returns profile schema version, settings schema version, component ID, revision, update time, the typed effective subset, and a flat source map whose values are only `global` or `component`. Neither page supplies a component ID, path, key, or query. The shared browser client accepts profile schemas 1 and 2 during rolling reloads, normalizes to profile schema 2, validates the expected component, strips unknown data, clones values at its API boundary, and refuses to replace a newer revision with an older response.

## Runtime Data

Authoritative Nexus data belongs beneath `%LOCALAPPDATA%\Cyrune\Nexus` on Windows. Current and planned logical areas are:

- typed global settings and sparse fixed component overrides;
- settings schema and migration state;
- bounded settings change history;
- the last sanitized project snapshot;
- sanitized validation receipts;
- future theme definitions and canonical tag metadata after explicit migrations.

The repository contains source, schemas, examples, and fixtures only. It must not contain live settings, user location, runtime snapshots, repository paths, database fingerprints from a user's installation, validation receipts, or private component data.

The Nexus page is the settings editor, not the runtime server. Relay and Host make settings readable by Portal/Widgets and Arcade while the Nexus page is closed. A small browser-local settings preview and bounded allowlisted-document cache may make the page useful during disconnection but must be labelled non-authoritative and never silently overwrite a newer Host revision. Document loading prefers authenticated Host, then the same direct local repository URL, then a cached copy; Markdown remains escaped and non-executable in every mode.

## Shared Settings

Settings are typed, namespaced, versioned, validated, documented, and migrated. An arbitrary key/value store is prohibited. Settings schema 2 follows this precedence:

```text
schema default -> global value -> fixed component override -> local Widget setting
```

Component overrides are sparse and may contain only Host-declared paths for `portal-widgets` or `arcade`. Location permission switches are global ceilings and cannot be overridden. Optional-network overrides may narrow a component from allowed to denied but cannot relax a global denial. Stable logical keys follow this shape:

```text
global.region.country
global.region.timeZone
global.units.system
global.units.temperature
global.language.primary
global.language.secondary
global.formatting.clock
global.accessibility.reducedMotion
global.privacy.allowOptionalNetwork
overrides.portal-widgets.units.system
overrides.arcade.formatting.weekStart
```

The first schema covers:

- country/region, time zone, optional city, and explicit location mode;
- metric, imperial, or custom temperature, distance, speed, mass, volume, and pressure;
- primary and secondary language plus interface and content language preferences using BCP 47 tags;
- date order, 12/24-hour clock, number/currency formatting, and week start;
- external-link handling, privileged-action confirmations, and last-view restoration;
- interface scale, reduced motion, and contrast preferences;
- external-link, optional-network, approximate-location, and precise-location permissions.

Location is manual by default. Approximate or precise automatic location requires an explicit global opt-in and a declared component capability. Stored latitude and longitude must be supplied as a complete bounded pair and require the precise-location permission. Settings responses expose only the value needed by that component; they do not make location or other sensitive fields universally available by accident.

The implemented `portal-widgets` profile contains regional city/location mode, units, languages, formatting, behaviour, accessibility, optional-network permission, and both location permission flags because Portal hosts declared location-aware widgets. It includes coordinates only when the global precise-location permission is enabled and a complete valid pair exists. The `arcade` profile contains country/time zone, units, languages, formatting, behaviour, accessibility, and optional-network permission; it deliberately excludes city, location mode, coordinates, and approximate/precise location permissions. Future additions require a versioned profile change and consumer coverage rather than a generic settings read.

Portal applies interface language, scale, reduced motion, and contrast to its document and exposes the profile to hosted Widgets through `WidgetSDK.settings`. Widget SDK 3 resolves an explicitly inherited path with its effective value and `local`, `global`, or `component` source. Weather, Weather Map, and Calendar keep inheritance disabled by default; Astronomy uses the permitted shared location only after its existing Weather-widget lookup and before requiring a separately configured location. The SDK's managed network gateway rejects optional requests when `allowOptionalNetwork` is false. Arcade applies the same presentation subset to its own document. Arcade scraper and remote-artwork network activity additionally requires an authoritative `true` at the service, Host, and Relay boundaries and fails closed when that profile is unavailable. Component startup remains non-blocking and uses documented presentation defaults when Relay or Host is unavailable.

Each authoritative snapshot includes a schema version, monotonic revision, updated timestamp, and typed setting sections. Writes compare the expected revision and reject stale callers. Unknown sections or keys, wrong types, excessive or control-character strings, unsupported enum values, invalid region/language/currency identifiers, and automatic location without the matching permission are rejected rather than preserved invisibly.

## Status Snapshot

Relay returns a versioned aggregate snapshot with independent sampled times and errors. Snapshot schema 2 adds fixed per-source health objects with `healthy`, `attention`, `unavailable`, or `source-only` state, a stable diagnostic code, bounded summary, prescribed recovery guidance, and sample time. One unavailable section does not erase healthy sections, including when authoritative Nexus settings are unreadable. The presentation distinguishes source metadata, cached native state, a live remote check, and a validation receipt.

Allowed status includes:

- component ID, display name, declared version, source update time, and validation state;
- Relay availability, exact Nexus role state, file-scheme permission, Host availability, and declared capabilities;
- database display location, size, modification time, bounded fingerprint, backup health, schema, and content-free counts;
- Git branch, upstream name, ahead/behind counts against existing local refs, staged/unstaged/untracked counts, clean state, last commit metadata, and sanitized HTTPS remote URL;
- sanitized validation timestamp, commit, component versions, test counts/outcomes, syntax/manifest/version/package/lint outcomes.

Snapshots must not include database contents, user item names, game paths, approved roots, checkout paths, command output, credential targets/values, native bindings, environment dumps, logs, or arbitrary errors. User-facing errors are stable codes plus bounded guidance.

The coordinated repository validator writes `validation.json` atomically only after all enabled suites and gates succeed. The receipt contains fixed component/test/check identifiers, numeric passing counts, declared component versions, the validated commit, and bounded outcomes. It never contains captured output, commands, paths, test names, environment values, failure traces, or arbitrary fields. A failed or interrupted validation preserves the preceding known-good receipt.

Local ahead/behind is cached upstream state. The implemented live comparison is an explicit user action using fixed, non-interactive, timeout-bounded `git ls-remote` against `origin` and the current branch. It reports whether the branch exists remotely and, when present, whether local HEAD or the cached tracking ref matches the live remote commit; if the tracking ref is stale, Nexus tells the user that a separate fetch is required before ahead/behind counts can be recalculated. Nexus never performs an automatic `git fetch`, merge, pull, push, checkout, commit, clean, or reset.

## Component Documents

Nexus requests documents with an allowlisted pair such as `{ component: "Portal", documentType: "todo" }`. Host maps that pair to the registered component TODO or changelog. Callers never provide a path.

Markdown rendering disables raw HTML, remote scripts, embedded active content, unsafe URL schemes, and unbounded documents. Local source links and explicit HTTPS project links may be allowed. The component pages remain read-only in the initial release.

TODO editing is an explicit user-triggered exception to the read-only presentation: Nexus sends only a fixed component ID, Host resolves that ID to the registered TODO, and Host opens it in Visual Studio Code with an argument array. Nexus never supplies or receives the file path or editor executable. Changelogs have no edit/open action because coordinated release tooling owns their updates; their allowlisted previews remain read-only.

## Future Theme Manager

Portal retains its current Theme Manager and theme data until a separate compatibility migration is designed and tested. A future Nexus Theme Manager may own global theme definitions and the selected theme. Themes use versioned design tokens; components declare supported tokens and retain accessible fallbacks. Relay broadcasts theme revision changes to authenticated clients.

## Future Tag Manager

Portal retains its current tags and tag assignments until a separate compatibility migration is designed and tested. A future Nexus Tag Manager may own canonical tag IDs, names, colours, aliases, and relationships. Each component retains ownership of assignments between its records and canonical tag IDs. Migration must preserve Portal IDs, inheritance behaviour, groups, rollback, and portable exports.

## Compatibility and Validation

Every contract change is versioned and backward-compatible or has an explicit migration and rollback. Validation must cover exact-page/role authentication, wrong-role rejection, bounds, redaction, corrupt state, stale revisions, atomic/interrupted writes, unavailable Relay/Host, old caches, unsafe Markdown, repository privacy, and component-specific partial failures.
