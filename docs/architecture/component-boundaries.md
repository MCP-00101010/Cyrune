# Cyrune Component Boundaries

This document is the durable cross-component ownership contract. The repository-root `AGENTS.md` routes implementation work to the applicable component instructions; component READMEs describe setup and local structure.

## Portal

Portal owns boards, tabs, columns, folders, Sets, Inbox and Import Manager content, tags, launcher presentation, widget hosting, and the portable database model. It consumes authenticated Relay services and never receives native executable paths, credentials, or emulator command authority as portable data.

## Arcade

Arcade owns game libraries, collections, metadata, artwork, scrapers, emulator definitions, managed profiles, and launch decisions. Its HTML/CSS/JavaScript interface remains external; service logic remains transport-independent and is loaded by Host.

## Relay

Relay owns exact-page registration, per-tab authentication, client roles, browser APIs, durable pending intake, acknowledgements, conflict-aware routing, extension-owned storage, and the persistent Host connection. It contains no Arcade business logic and has no direct native path authority.

## Host

Host owns native files, processes, approved directories, application/game bindings, secure credentials, optional disk-backed Portal persistence, native configuration, and OS integration. Relay remains able to provide authoritative Portal storage without enabling Host. Host validates native requests but does not own Portal or Arcade presentation.

## Widgets

Widgets own their provider adapters, settings, presentation, and bounded local runtime state. Shared registry, SDK, caching, scheduling, network, settings, and action-layout services live in `Widgets/core`; component-specific business logic does not.

## Nexus

Nexus owns project-status aggregation and presentation, typed shared-settings schemas and management, sanitized validation receipts, and its own cached view state. It remains a direct `file://` diagnostic client and does not gain filesystem, Git, process, credential, Portal database, or Arcade library authority. Relay authenticates the exact Nexus client role; Host provides fixed-purpose settings persistence and sanitized inspection operations. Host also derives fixed `portal-widgets` and `arcade` settings profiles, while Relay maps each authenticated component role to exactly one profile and broadcasts only revisions.

## Durable Rules

- Keep compatibility-sensitive extension/Host IDs, credential names, schema IDs, storage keys, and opaque bindings stable during path migration.
- Keep mutable runtime data outside the checkout, with portable/development overrides where needed.
- Keep page storage for explicitly local widget/UI state and a non-authoritative Portal recovery cache rather than the authoritative Portal database. Relay owns the versioned fallback snapshot when Host disk storage is disabled.
- Route Portal database, backup, theme, and managed-background access through fixed-purpose Host operations. Relay may carry portable content and opaque revision metadata, but it must not choose or forward a native target path for those operations.
- Gate native-only operations on declared Host capabilities and show actionable recovery when unavailable.
- Use Inbox as the common external-delivery destination.
- Keep direct-file Portal and Arcade clients bound to exact Relay registrations and role-specific capabilities; a matching meta identifier alone grants no authority.
- Keep compact Portal game/application records separate from Host-owned device bindings and Arcade-owned launch policy.
- Arcade owns title-family grouping and explicit shared version defaults. Portal consumes bounded family presentation through Relay; Host validates membership and exact approvals for version selection. Grouping never deletes or rewrites the underlying exact targets or portable shortcut records.
- The optional Arcade catalogue capability lets Portal browse configured managed Spectrum libraries, including read-only sources, and explicitly bind selected exact entries. Optional `arcade-scummvm: 1` adds existing configured ScummVM registrations and their independently validated native target plans; see `arcade-scummvm-adapter.md`. No user preparation is required. A native metadata index and private identity key support browsing; collection data and Host approvals are unchanged until their respective explicit actions. Media and launch-policy validation belong to Add/launch. Its protocol, mapping and acceptance evidence are documented in `portal-arcade-contract.md` and `portal-arcade-spectrum-migration.md`; later adapters and publication require their own gates.
- Keep cross-component message and portable-data changes backward-compatible or provide an explicit, versioned migration with focused regression coverage.
- Keep shared settings typed, versioned, namespaced, revision-aware, and available while the Nexus page is closed. Do not expose an arbitrary key/value, path, command, or query interface.
- Keep Portal's current theme and tag ownership until separately documented compatibility migrations move those managers to Nexus.

The detailed Portal/Arcade/Relay/Host contract is defined in `portal-arcade-contract.md`. The Nexus settings and status contract is defined in `nexus-contract.md`. Component manifests, protocol negotiation, migrations, operational events and affected-suite validation are defined in `infrastructure-contract.md`; preserved aliases and their removal conditions live in `compatibility-register.json`. Portal modal and settings presentation rules are defined in `portal-ui-guidelines.md`.
