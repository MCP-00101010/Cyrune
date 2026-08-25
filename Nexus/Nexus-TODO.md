# Cyrune Nexus TODO

This file owns project-status aggregation, shared Cyrune settings, Nexus presentation/cache state, sanitized validation receipts, and future shared theme/tag management.

## Foundation Follow-ups

- Add schema migrations and typed per-component setting overrides to the versioned settings snapshot.
- Add component metadata manifests for Portal, Widgets, Arcade, Relay, and Host; validate runtime versions against their manifests where applicable.

## Status Dashboard

- Add authenticated browser-local Widget health and expand component adapters beyond the implemented Portal database, Arcade service/state, Nexus settings, Host, and Relay checks.

## Shared Variables

- Support search, categories, inherited/default indicators, per-component overrides, reset, import/export, migrations, and sanitized change history.
- Keep precise location and automatic geolocation opt-in; distinguish country/region, city, and coordinates in both schema and UI.

## Component Documents

- Add safe Markdown search, task filters, changelog version navigation, and responsive side-by-side/sub-tab layouts.
- Add project-wide release readiness and cross-component outstanding-work summaries without treating Markdown as executable content.

## Future Shared Managers

- Design and migrate a shared Theme Manager with versioned design tokens, supported-token declarations, preview, fallback, and live change notifications.
- Design and migrate a canonical Tag Manager with stable IDs, names, colours, aliases, relationships, and component-owned assignments.
- Move Secrets Management into Nexus so only one component has to deal with API Keys/Credentials etc. Advise on best/most secure method for components to access their needed secrets.
- Keep Portal's existing theme and tag ownership until separate compatibility migrations preserve its database and rollback path.

## Hardening and Release

- Add keyboard, screen-reader, contrast, reduced-motion, narrow-layout, corrupt-cache, and partial-service coverage.
- Add migration, interrupted-write, corrupt-authoritative-state, and expanded redaction tests around the implemented Relay/Host contract.
- Verify direct-file startup, stale cached snapshots, offline behaviour, and recovery guidance in Firefox.
- Monitor Nexus 0.1.6's authoritative settings/status/document/editor/remote-check and independent health service during normal Cyrune use before expanding its mutation surface.
