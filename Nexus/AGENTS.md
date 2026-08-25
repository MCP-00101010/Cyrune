# Cyrune Nexus Instructions

These instructions augment the repository-root `AGENTS.md` for all files under `Nexus/`.

## Required Context

Before acting on Nexus code, read `Nexus/README.md`, `docs/architecture/component-boundaries.md`, and `docs/architecture/nexus-contract.md`. Read the affected component instructions before changing a component adapter, and read `Relay/AGENTS.md` plus `Host/AGENTS.md` before changing authenticated transport, persistence, repository inspection, or runtime diagnostics.

## Ownership and Authority

- Nexus owns project-status aggregation, shared-settings schemas and management UI, sanitized validation receipts, and its own presentation/cache state.
- Nexus is a direct `file://` application and must remain useful as a partial diagnostic surface when Relay or Host is unavailable.
- Nexus does not gain direct filesystem, Git, browser, process, credential, Portal database, or Arcade library authority. Use exact authenticated Relay roles and fixed-purpose Host operations.
- Settings must be typed, versioned, namespaced, validated, and migrated. Do not introduce an arbitrary key/value or arbitrary-path interface.
- Never expose credentials, database contents, user content, native targets, repository paths, command output, or unredacted bindings in snapshots, caches, receipts, or UI.

## Interface and Future Managers

- Keep the initial product read-only except for Nexus-owned shared settings. Clearly distinguish authoritative settings from browser-local previews and cached status.
- Render repository Markdown locally with raw HTML disabled and links restricted to safe local or HTTPS targets.
- Themes and tags may move to Nexus only through separately documented migrations. Components keep their current ownership until those migrations are implemented and verified.
- Settings must remain readable by components when the Nexus page is closed; the page is the editor, not the runtime service.

## Validation

Run `node --test "Nexus/tests/*.cjs"` for Nexus changes. Run the root coordinated validator for settings, Relay, Host, metadata, validation-receipt, or other cross-component contract changes. Product-visible Nexus changes require a Nexus version bump and `Nexus-CHANGELOG.md` entry.
