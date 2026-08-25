# Cyrune Host Instructions

These instructions augment the repository-root `AGENTS.md` for all files under `Host/`.

## Required Context

Before acting on Host code, read `Host/README.md`, `docs/architecture/component-boundaries.md`, and `docs/architecture/portal-arcade-contract.md`. Read `Relay/AGENTS.md` and the affected client component instructions before changing native messages, capabilities, bindings, Arcade service loading, or Portal persistence.

## Native Authority and Security

- Host alone owns native filesystem, process, approved-directory, application/game binding, secure credential, disk persistence, picker, and OS-integration authority.
- Validate every request independently of Relay. Use fixed-purpose operations, bounded values, approved roots/bindings, real-path confinement, and argument-array process startup; never expose a general shell or arbitrary path executor.
- Keep credentials in the OS secure store. Preserve credential target names, verify secure writes by rereading them, and never expose values through portable data, extension storage, logs, diagnostics, caches, or migration receipts.
- Return sanitized, content-free diagnostics and opaque handles. Never export approved filesystem, executable, emulator, profile, working-directory, or game targets.
- Keep live configuration and runtime state outside the checkout. `config.example.json` documents shape only and must contain no real user paths, bindings, or secrets.

## Compatibility and Component Boundaries

- Preserve the installed native-messaging host ID, launcher/manifest names, credential target prefix, native message types, opaque binding fields, and stable IDs unless an explicit compatibility migration is documented and tested.
- Host validates and transports Arcade service operations but does not own Arcade collection, metadata, scraper, profile, or launch-policy business logic.
- Host provides Portal disk authority but does not own Portal schema, presentation, conflict decisions, or empty-cache recovery policy.
- Keep Host optional: Relay-owned storage and non-native product views must fail safely when native capabilities are unavailable.

## Persistence and Validation

- Use revision/hash-aware comparison, native locking, backups, chunk identity, and atomic replacement for authoritative Portal files. Reject changed or replaced files during chunked reads.
- Run `python -m pytest -q Host/tests` for Host changes. Run installer syntax/registration checks when installers, manifests, launchers, or configuration paths change. Run the root coordinated validator for Relay transport, Portal persistence, Arcade services, packaging exclusions, or compatibility changes.
