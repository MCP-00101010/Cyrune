# Cyrune Component Boundaries

## Portal

Portal owns boards, tabs, columns, folders, Sets, Inbox and Import Manager content, tags, launcher presentation, widget hosting, and the portable database model. It consumes authenticated Relay services and never receives native executable paths, credentials, or emulator command authority as portable data.

## Arcade

Arcade owns game libraries, collections, metadata, artwork, scrapers, emulator definitions, managed profiles, and launch decisions. Its HTML/CSS/JavaScript interface remains external; service logic remains transport-independent and is loaded by Host.

## Relay

Relay owns exact-page registration, per-tab authentication, client roles, browser APIs, durable pending intake, acknowledgements, conflict-aware routing, extension-owned storage, and the persistent Host connection. It contains no Arcade business logic and has no direct native path authority.

## Host

Host owns native files, processes, approved directories, application/game bindings, secure credentials, disk-backed Portal persistence, native configuration, and OS integration. It validates native requests but does not own Portal or Arcade presentation.

## Widgets

Widgets own their provider adapters, settings, presentation, and bounded local runtime state. Shared registry, SDK, caching, scheduling, network, settings, and action-layout services live in `Widgets/core`; component-specific business logic does not.

## Durable Rules

- Keep compatibility-sensitive extension/Host IDs, credential names, schema IDs, storage keys, and opaque bindings stable during path migration.
- Keep mutable runtime data outside the checkout, with portable/development overrides where needed.
- Keep page storage for explicitly local widget/UI state rather than the authoritative Portal database after the required-Relay cutover.
- Gate native-only operations on declared Host capabilities and show actionable recovery when unavailable.
- Use Inbox as the common external-delivery destination.
