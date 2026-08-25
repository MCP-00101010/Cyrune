# Cyrune Repository Instructions

## Component Ownership

- `Portal/`: dashboard application and Portal-owned assets/tests.
- `Arcade/`: game-library application and Arcade-owned assets/tests.
- `Relay/`: WebExtension source and Relay-owned tests.
- `Host/`: native-messaging source, installers, templates, and Host-owned tests.
- `Widgets/`: widget implementations grouped by catalogue category.
- `tests/`: cross-component integration and migration coverage only.

During migration, preserve schemas, extension/native identifiers, persisted storage keys, bindings, and user data unless a separately documented compatibility migration explicitly changes them.

## Release and Commit Checklist

Before committing product changes:

1. Bump only the affected component version. Portal currently stores its version in `Portal/source/app.js` and displayed fallbacks in `Portal/index.html`; Relay stores its version in `Relay/manifest.json`.
2. Add a dated entry to the affected component `CHANGELOG.md`, including relevant validation. Use the root changelog only for repository-wide infrastructure or coordinated release entries.
3. Update only the affected component `TODO.md` for completed work or changed monitoring/version references.
4. Run the affected component tests plus cross-component integration checks when a boundary changes.
5. Run `web-ext lint` when Relay files change, and run Host tests when native transport, persistence, launch, or installer code changes.

Keep unrelated user changes out of scoped commits.
