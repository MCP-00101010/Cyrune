# Cyrune Nexus

Cyrune Nexus is the local control centre for the Cyrune project. It combines a project-health dashboard with the management surface for settings shared across Portal, Widgets, Arcade, Relay, Host, and future components.

Open `index.html` directly in Firefox. Relay 1.1.0 authenticates that exact local document—including its client-side hash routes—and connects it to Host-backed settings, project status, project documents, allowlisted TODO editing in Visual Studio Code, and an explicit read-only origin check. Without Relay or Host, Nexus remains usable as a clearly labelled, non-authoritative preview and reports the missing service instead of inventing healthy state.

## Current Release

- Overview cards for every component, the shared service boundary, runtime data, repository state, and recent project activity.
- Component pages with version/status summaries and side-by-side previews for each component TODO and changelog. TODO actions open the exact allowlisted file in Visual Studio Code; changelogs remain read-only without a redundant open-file link.
- An interactive Variables screen covering region, units, languages, formatting, behaviour, accessibility, and privacy/network preferences, with search, schema-checked JSON import/export, and sanitized changed-key history. Host persistence retains revision-conflict protection; Global, Portal & Widgets, and Arcade scopes show effective sources and sparse component overrides.
- Settings schema 2 migration, permission-gated precise coordinates, and fixed profile-schema source metadata. Widget SDK 3 consumers can opt into shared location, units, or week-start values without changing existing local defaults.
- Live sanitized status for manifest-backed component versions and update ages, a project-wide protocol compatibility matrix, component TODO summaries, Relay and Host availability, runtime-data files, local repository state, bounded operational events, and available validation receipts.
- Independent component and runtime-data health states with schema/backup summaries, sample ages, stable diagnostic codes, and actionable recovery guidance; one failed settings or data section does not hide healthy diagnostics elsewhere.
- An explicit **Check origin** action that compares the current branch with fixed `origin` without fetching or mutating the checkout; cached ahead/behind counts are clearly distinguished from the live comparison.
- A detailed Activity receipt showing the last successful coordinated commit, component versions, passing suite counts, and release-gate outcomes without retaining command output.
- Allowlisted component TODO and changelog loading through the authenticated Nexus role, with fallback to direct local files and then the last bounded browser cache.
- Browser-local settings and document caches that remain available during disconnection but are never presented as authoritative or allowed to overwrite a newer Host revision silently.
- Responsive layouts that collapse document columns and component navigation cleanly on smaller screens.

Authoritative settings are stored in `%LOCALAPPDATA%\Cyrune\Nexus\settings.json` on Windows and served through fixed-purpose Host operations. Set `CYRUNE_NEXUS_DATA` only for controlled development or portable testing. Host owns persistence and fixed component subsets, Relay owns exact-role authentication and transport, and the page owns presentation. Portal/Widgets and Arcade consume separate typed profiles while Nexus is closed and refresh after revision-only broadcasts.

## Structure

```text
Nexus/
  index.html                 direct-file application entry point
  component.json             component, capability, protocol and schema metadata
  client/component-settings.js typed fixed-profile client for browser components
  source/component-registry.js generated manifest-backed component catalogue
  source/adapters.js         fixed allowlisted runtime/compatibility adapters
  source/model.js            settings schema and safe Markdown model
  source/bridge.js           authenticated Nexus-to-Relay page transport
  source/service.js          bounded revision-aware document request/cache service
  source/app.js              navigation, live rendering, refresh and settings state
  source/styles.css          standalone interface styling
  tests/*.cjs                model, client, safety, structure, and version coverage
  AGENTS.md                  Nexus implementation constraints
  Nexus-TODO.md              active Nexus backlog
  Nexus-CHANGELOG.md         Nexus release history
```

The durable ownership and transport design is in `../docs/architecture/nexus-contract.md`; manifest, protocol, migration and event rules are in `../docs/architecture/infrastructure-contract.md`.

## Validation

Run the focused checks from the repository root:

```powershell
node --test "Nexus/tests/*.cjs"
node --check Nexus/source/model.js
node --check Nexus/source/bridge.js
node --check Nexus/source/service.js
node --check Nexus/source/app.js
python tools/validate_infrastructure.py --repo .
python tools/validate_versions.py --repo .
```

The coordinated `..\tools\validate.ps1` command atomically updates `%LOCALAPPDATA%\Cyrune\Nexus\validation.json` only after every enabled check succeeds. Failed or interrupted runs leave the previous known-good receipt intact.
