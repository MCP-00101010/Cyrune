# Cyrune Project

Cyrune is a local-first personal portal and game-library suite. It combines a configurable dashboard, reusable widgets, a collection-aware arcade launcher, a Firefox bridge, and a narrowly scoped native service in one repository. Portal and Arcade remain directly openable `file://` applications; Relay and Host add authenticated browser and operating-system capabilities without turning the checkout into a web server.

## Components

- **Portal** is the dashboard shell. It owns boards, tabs, columns, items, the Inbox/Import Manager, appearance, portable exports, and the client side of shared persistence.
- **Widgets** owns the widget catalogue, SDK, shared widget services, provider integrations, focused tests, and widget-local state. Portal loads this component but does not own its implementations.
- **Arcade** is the game-library and emulator frontend. It owns collections, metadata, favourites, recent games, managed emulator profiles, scraping, and launch policy.
- **Relay** is the Firefox WebExtension. It authenticates exact Portal, Arcade, and Nexus pages under separate roles, brokers browser APIs, routes bounded deliveries, and connects those pages to Host.
- **Host** is the native-messaging service. It owns approved filesystem, process, credential, binding, picker, native Arcade, authoritative Nexus-settings, and sanitized project-metadata operations.
- **Nexus** is the project control centre. It owns project-status aggregation, typed shared-settings management, sanitized validation receipts, and its own cached view state while Relay and Host retain transport and native authority.

The boundaries are intentional: browser privileges stay in Relay, device authority stays in Host, and portable product data does not acquire machine-local paths or credentials.

## Repository Layout

```text
Cyrune/
  Portal/       dashboard application and Portal tests
  Widgets/      widget runtime, catalogue, SDK, assets, and tests
  Arcade/       game-library application, service core, and tests
  Relay/        Firefox WebExtension and Relay tests
  Host/         native-messaging host, installers, templates, and tests
  Nexus/        status dashboard, shared-settings UI, metadata, and tests
  tools/        validation, migration, and packaging tools
  tests/        repository-level migration and packaging tests
  docs/         migration, history, and operational records
```

## Runtime and Data

Mutable application data lives outside the repository beneath `%LOCALAPPDATA%\Cyrune` on Windows:

- `%LOCALAPPDATA%\Cyrune\Portal` contains the shared Portal database, backups, and managed backgrounds.
- `%LOCALAPPDATA%\Cyrune\Arcade` contains Arcade configuration, state, managed profiles, logs, and cache.
- `%LOCALAPPDATA%\Cyrune\Host` contains native-host configuration and other Host-owned runtime state.
- `%LOCALAPPDATA%\Cyrune\Nexus` contains authoritative shared settings, bounded content-free setting history, operational events and backups, and may contain sanitized snapshots and validation receipts. Nexus retains a clearly labelled browser-local cache only for disconnected use.

Documented environment overrides support portable development and controlled testing. The repository itself should contain source and fixtures, not live databases, credentials, logs, caches, generated packages, or user-specific bindings.

Portal and Arcade use durable, atomic JSON persistence where they own files. Credentials remain in the operating system's secure credential store. Device-local application and game targets remain behind opaque Host bindings rather than entering portable JSON.

## Compatibility Contract

The Cyrune rename does not invalidate existing installations or data. Compatibility-sensitive values retain their historical identifiers, including:

- the Firefox extension ID and native-messaging host ID;
- native-host launcher and registration names required by installed manifests;
- Portal and Arcade identifying meta values;
- extension messages, page events, storage keys, and schema fields where changing them would orphan persisted state;
- credential targets, opaque application/game bindings, and portable bundle format identifiers.

These values are implementation contracts, not displayed product names. User-facing text should use Cyrune Portal, Cyrune Arcade, Cyrune Relay, Cyrune Host, or Cyrune Widgets as appropriate.

## Development and Validation

Run the coordinated validation suite from the repository root:

```powershell
.\tools\validate.ps1
```

It runs Portal, Widgets, Relay, Host, Nexus, migration, packaging, tooling, and Arcade tests; syntax-checks JavaScript; parses the Relay manifest; validates component manifests, protocol/compatibility contracts and the generated Nexus registry; verifies independent component versions; and runs `web-ext lint`. Use `-ChangedOnly` for a conservative development check selected from changed paths; only a full run writes the release receipt. Use `-SkipWebExtLint` only for an explicitly documented offline or tool-unavailable check.

Component work should remain within its owning directory where practical. Cross-component changes must preserve the public message, data, binding, and storage contracts or include an explicit compatibility migration with regression coverage.

## Agent Guidance

The repository-root `AGENTS.md` contains shared ownership, compatibility, release, and instruction-routing rules. Before acting on a component, Codex must completely read that component's `AGENTS.md`, even when the session started at the repository root:

- `Portal/AGENTS.md`
- `Widgets/AGENTS.md`
- `Arcade/AGENTS.md`
- `Relay/AGENTS.md`
- `Host/AGENTS.md`
- `Nexus/AGENTS.md`

For cross-component changes, read every affected component file plus `docs/architecture/component-boundaries.md`. Detailed rules remain in architecture documents and component READMEs; AGENTS files contain the concise constraints that must influence implementation and review.

## Releases and Packaging

Portal, Relay, and Nexus version independently. Product changes bump only the affected component version and update its prefixed changelog. Relay source changes also require an extension manifest bump and `web-ext lint`.

Relay packaging is deterministic and writes ignored artifacts beneath `artifacts/Relay/<version>`. Unsigned AMO upload archives, SHA-256 sidecars, and sanitized reports are separate from validated Mozilla-signed XPI imports. Generated artifacts are not source files and must not be committed.

Repository-wide migration, tooling, and coordinated-release changes belong in the root `CHANGELOG.md`; component-visible changes belong in that component's changelog.

## Documentation Map

- `docs/history/cyrune-monorepo-migration.md` preserves the completed migration and cutover checklist as a retired historical record.
- `Portal/Portal-TODO.md`, `Arcade/Arcade-TODO.md`, `Relay/Relay-TODO.md`, `Host/Host-TODO.md`, `Widgets/Widgets-TODO.md`, and `Nexus/Nexus-TODO.md` own active component work.
- Each component's `<Component>-CHANGELOG.md` records completed product changes.
- `CHANGELOG.md` records repository-wide changes.
- `docs/migration/` contains inventories, receipts, validation records, rollback guidance, and handovers.
- `docs/architecture/component-boundaries.md` defines durable ownership and authority boundaries.
- `docs/architecture/portal-ui-guidelines.md` defines Portal and Portal-hosted Widget modal/settings presentation rules.
- `docs/architecture/portal-arcade-contract.md` defines the current Portal/Arcade/Relay/Host integration and security contract.
- `docs/architecture/nexus-contract.md` defines Nexus settings, snapshots, documents, authority, redaction, and future theme/tag ownership.
- `docs/architecture/infrastructure-contract.md` defines component manifests, the generated registry, protocol negotiation, migration receipts, operational events, and validation selection.
- `docs/architecture/compatibility-register.json` records preserved aliases and the explicit conditions required before any removal.
- `docs/history/` preserves superseded plans and completed legacy work without treating them as active backlog.
- Root and component `AGENTS.md` files define routed implementation, compatibility, validation, and release rules.

## Migration Status

The monorepo migration is complete and Cyrune on `master` is the active project. Source, preserved component histories, tests, the Host boundary, widget catalogue, packaging workflow, and active Portal/Arcade runtime data now use Cyrune. Portal and Arcade have been verified at their permanent Cyrune paths, with live data beneath `%LOCALAPPDATA%\Cyrune`. The intact legacy checkouts were retired to the dated migration-recovery archive on 2026-08-31; verified Git bundles and runtime snapshots remain available for recovery.

New work should target this repository and use the Cyrune component names. Legacy names should appear only in compatibility code, historical documentation, migration fixtures, or tests that deliberately verify old data continues to load.
