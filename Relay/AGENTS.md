# Cyrune Relay Instructions

These instructions augment the repository-root `AGENTS.md` for all files under `Relay/`.

## Required Context

Before acting on Relay code, read `Relay/README.md`, `docs/architecture/component-boundaries.md`, and `docs/architecture/portal-arcade-contract.md`. Read the affected client component instructions plus `Host/AGENTS.md` before changing page registration, message contracts, durable intake, native transport, or capabilities.

## Authentication and Authority

- Authorize only the canonical configured Portal and Arcade `file://` pages. A matching meta tag alone never grants capabilities.
- Bind page-originated commands to the exact registered tab, client role, page URL, and opaque session token. Reject stale, cross-tab, cross-role, navigated, or unsupported-page requests.
- Keep Portal and Arcade capabilities separate. Portal cannot call Arcade mutation/maintenance operations; Arcade cannot acquire unrestricted browser, filesystem, credential, or process authority.
- Relay owns browser APIs, durable pending intake, acknowledgements/deduplication, extension-owned fallback storage, routing, and the persistent Host connection. It contains no Arcade business logic and no direct native path authority.
- Bound and validate every message, string, list, byte payload, transfer, job history, remote response, and configuration count before forwarding or storing it.

## Compatibility and Storage

- Preserve the Gecko extension ID, native-host ID, message/event types, storage keys, alarms, context-menu IDs, compatibility meta selectors, and authenticated operation names unless an explicit migration is documented and tested.
- Never place credentials, unredacted native targets, portable database contents, or sensitive diagnostics in extension logs or storage outside their declared authority model.
- Durable queued intake must be quota-bounded, delivery-ID deduplicated, and acknowledged exactly once after an authenticated Portal registration.

## Packaging and Validation

- The package allowlist is exact: `manifest.json`, `background.js`, `content.js`, both icons, and the three popup files. Never admit Host code, tests, configuration, databases, credentials, repository docs, or generated reports into the XPI payload.
- Any Relay source change requires a manifest version bump, `Relay-CHANGELOG.md` entry, Relay tests, packaging tests, manifest parsing, and `web-ext lint`.
- Run `node --test "Relay/tests/*.cjs"`, `python -m pytest -q tests/packaging`, and `npx --yes web-ext lint --source-dir Relay`; run the root coordinated validator for client, Host, persistence, delivery, or packaging-boundary changes.
