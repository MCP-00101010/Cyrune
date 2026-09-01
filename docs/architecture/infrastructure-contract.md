# Cyrune Infrastructure Contract

This document defines the extension seams used when Cyrune gains a component, protocol, migration or diagnostic. Component authority remains defined in `component-boundaries.md`.

## Component manifests and Nexus registry

Every component owns one schema-1 `component.json`. It declares the component's semantic version, safe local entry point and icon, TODO/changelog, capabilities, protocol versions, data schemas, and Nexus adapter name. Paths are component-relative and cannot escape their component.

`tools/build_component_registry.py` validates all six manifests and generates `Nexus/source/component-registry.js`. Nexus must consume that generated registry; it must not maintain a parallel component/version list. Adding a component therefore requires a manifest, documents, an icon, a fixed Nexus adapter, and its owned tests rather than edits scattered across the dashboard.

Adapters are allowlisted local code in `Nexus/source/adapters.js`. Manifest data can select an adapter by its fixed ID, but it cannot provide code, HTML, commands, paths, queries, or native actions.

## Protocol and capability negotiation

`infrastructure/protocols.json` is the authoritative catalogue of current protocol versions, participants and payload ceilings. A component manifest declares the versions it implements. Relay and Host advertise their component version, protocols and capabilities during their existing authenticated registration and health exchanges.

Nexus compares advertised versions with the manifest requirements. Relay additionally enforces the minimum protocols advertised by authenticated Portal, Arcade, and Nexus registrations, while Portal validates Relay's advertised minimums before enabling mutations. Relay treats a missing or older `host-native` protocol as an unavailable Host and continues only with capabilities that remain Relay-owned. Missing advertisements are reported as unknown; a missing or older required protocol is incompatible. Compatibility identifiers remain governed by `compatibility-register.json`.

## Migrations

`infrastructure/migration.py` supplies ordered, dry-runnable, idempotent migration steps and atomic content-free receipts. A product migration must additionally define its own source/destination confinement, verification, rollback and user-choice rules. Receipts may contain plan IDs, schema/version numbers, timestamps, fixed step IDs and outcomes; they must never contain user content, credentials, command output or native paths.

Portal portable state and Host-owned Nexus settings use explicit ordered registries and reject schemas newer than the running component. Other persisted schemas must adopt the same shape before their next schema increment: one bounded step per version, no skipped versions, deterministic reruns, and focused old/current/newer-schema tests.

Successful receipts make reruns no-ops. Failed receipts retain only the fixed step that failed. Existing compatibility aliases may be removed only when their register entry's removal condition has been met through a separately documented migration.

## Operational events

Host owns a bounded journal outside the checkout at the Nexus data root. Events contain only an allowlisted component, fixed event code, severity, fixed summary and timestamp. Nexus may present the newest 50; it never receives exception strings, payloads, command output, credentials or paths. The journal is diagnostic and cannot be used as an execution queue.

## Validation

`tools/validate_infrastructure.py` gates manifest paths and identities, generated-registry freshness, protocol participation/runtime advertisements, and the compatibility register. `tools/affected_suites.py` provides a conservative changed-path mapping for fast development checks; manifest, protocol, compatibility and architecture changes deliberately select every suite. A full `tools/validate.ps1` run remains the release gate and is the only mode that writes a successful Nexus validation receipt.
