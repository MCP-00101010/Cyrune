# Cyrune Nexus TODO

- Monitor 0.3.1: coordinated data cutover, current protocol negotiation and first-reload browser upgrades. See `docs/architecture/suite-data-cutover.md` at repository root.

This file owns project-status aggregation, shared Cyrune settings, Nexus presentation/cache state, sanitized validation receipts, and future shared theme/tag management.

## Status Dashboard

- Add authenticated browser-local Widget health and expand component adapters beyond the implemented Portal database, Arcade service/state, Nexus settings, Host, and Relay checks.
- Exercise the implemented protocol release-readiness matrix across intentionally stale Portal, Arcade, Nexus, Relay, and Host combinations before enforcing minimum versions.

## Shared Variables

- Keep automatic geolocation as a separate explicit opt-in flow. Country/region, city, and permission-gated manual coordinates are implemented; do not infer coordinates or expose them outside the fixed Portal & Widgets profile.

## Remote Repository Sync Manager

- Add a project-wide sync management surface, beginning with explicit manual Portal sync against one configured private remote repository. Show enabled components, last successful fetch/push, pending local changes, remote divergence, validation state, and actionable failures without exposing repository paths, credentials, Git output, or portable database contents.
- Keep Nexus as the policy, status, history, and conflict-resolution UI rather than the sync runtime. Host owns credentials, the isolated Git worktree, network/filesystem operations, validation, backups, and atomic application; Relay exposes only fixed authenticated sync operations and bounded progress events.
- Add a first-device/new-device setup flow with an explicit choice to initialise an empty remote, import a validated remote snapshot, or merge it with existing local data. Never infer replacement, force-push, or silently overwrite a divergent authoritative database.
- Present component-provided record-level conflicts with bounded summaries and explicit local/remote/merged choices. Different stable IDs may merge automatically, while conflicting edits or deletions of the same logical record require deterministic component rules or user review.
- Keep sync available while the Nexus page is closed. Add opt-in startup/interval scheduling only after manual sync, offline retry, stale revision, concurrent-device, interrupted operation, corrupt remote, and recovery workflows are proven.
- Treat a private Git remote as access-controlled rather than end-to-end encrypted. Document that Git retains history and add client-side encryption only through a separately designed, versioned format with key-loss recovery and no plaintext secrets in commits, logs, receipts, or browser storage.

## Component Documents

- Add safe Markdown search, task filters, changelog version navigation, and responsive side-by-side/sub-tab layouts.
- Add priority/status filters to the implemented project-wide outstanding-work summary without treating Markdown as executable content.

## Future Shared Managers

- Design and migrate a shared Theme Manager with versioned design tokens, supported-token declarations, preview, fallback, and live change notifications.
- Design and migrate a canonical Tag Manager with stable IDs, names, colours, aliases, relationships, and component-owned assignments.
- Move Secrets Management into Nexus so only one component has to deal with API Keys/Credentials etc. Advise on best/most secure method for components to access their needed secrets.
- Keep Portal's existing theme and tag ownership until separate compatibility migrations preserve its database and rollback path.

## Hardening and Release

- Add keyboard, screen-reader, contrast, reduced-motion, narrow-layout, corrupt-cache, and partial-service coverage.
- Add migration, interrupted-write, corrupt-authoritative-state, and expanded redaction tests around the implemented Relay/Host contract.
- Verify direct-file startup, stale cached snapshots, offline cache fallback, settings portability, and recovery guidance in Firefox.
- Monitor Nexus 0.3.1's generated registry, protocol matrix, bounded event/settings journals, schema-2 settings, Widget consumers, document cache, and independent health service during normal Cyrune use before expanding its mutation surface.
