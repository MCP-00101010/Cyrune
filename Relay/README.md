# Cyrune Relay

Cyrune Relay is the Firefox-compatible WebExtension that authenticates trusted local Portal, Arcade, and Nexus pages, routes browser actions and durable intake, and maintains the persistent connection to Cyrune Host. Each local application has an exact, independently registered role; authority is never shared merely because pages are in the same checkout.

For shared variables, Relay maps Portal and Arcade roles to fixed Host-owned profiles and broadcasts only numeric settings revisions. A page cannot request another component's profile or provide setting paths. Relay also requires the authoritative Arcade profile to explicitly allow optional network access before it fetches remote artwork; an unavailable or denied profile fails closed.

Portal persistence uses Host's fixed-purpose disk operations when configured and a versioned Relay-owned snapshot otherwise. Both modes expose revision/content hashes, compare-and-swap saves, serialized writes, verified legacy migration, and cross-tab change broadcasts. Relay's bounded intake queues sanitized Inbox, Import Manager, and Arcade deliveries while Portal is closed, deduplicates by delivery ID, reports pending state, and replays through a single ordered drain. Relay transports portable content and opaque metadata but does not choose native targets. Arcade artwork requests accept only HTTPS URLs on the declared scraper/CDN host allowlist, recheck redirects, and lose their authenticated registration immediately when the page navigates.

Authenticated Portal, Arcade, and Nexus registrations must advertise the current minimum role protocols. Relay rejects missing or older clients with an actionable compatibility error, and treats a Host missing the current `host-native` protocol as unavailable without disabling Relay-owned Portal authority.

The optional catalogue transport uses a dedicated persistent Host connection per authenticated Portal session, with bounded transient search/detail/bind requests, independent Host canonical-page authorization, queue deadlines, and revocation on navigation or disconnect. Session handles stay inside Relay; catalogue data never enters extension storage or intake. Catalogue v1 includes selectable `available` entries for direct library browsing; exact launch readiness is checked on Add and launch. See the [direct browsing record](../docs/architecture/portal-arcade-spectrum-migration.md#direct-library-browsing--2026-09-07).

The unpackaged extension root is this directory. Native Python, installers, configuration, and launchers live exclusively in `../Host/` and must not be included in Relay packages.

## Architecture and Guidance

Catalogue artwork accepts only Host-normalized PNG responses. Relay checks ownership, dimensions, chunk checksums, decompressed size, and scanline shape before page delivery. The [artwork contract](../docs/architecture/portal-arcade-spectrum-migration.md#implemented-local-artwork-and-read-leases--arcade-026-host-023-relay-113) records the supported subset.

- [Relay instructions](AGENTS.md) define authentication, authority, compatibility, storage, packaging, and validation invariants.
- [Component boundaries](../docs/architecture/component-boundaries.md) define Relay's browser and routing ownership.
- [Portal–Arcade contract](../docs/architecture/portal-arcade-contract.md) defines canonical clients, role separation, bounded messages, and delivery rules.
- [Nexus contract](../docs/architecture/nexus-contract.md) defines the exact Nexus role, fixed settings/status/document operations, redaction, and revision rules.
- [Infrastructure contract](../docs/architecture/infrastructure-contract.md) defines Relay's manifest, runtime protocol/capability advertisements, compatibility register, and release gates.

## Tests

```powershell
node --test "Relay/tests/*.cjs"
npx --yes web-ext lint --source-dir Relay
```

## Packaging

Build the deterministic unsigned archive for AMO upload from the repository root:

```powershell
.\Relay\package-amo.ps1
```

The archive, SHA-256 sidecar, and content-free report are written beneath `artifacts/Relay/<version>/unsigned/`. Only `manifest.json`, the two runtime scripts, both icons, and the three popup files are admitted; Host code, installers, tests, configuration, databases, backups, credentials, and repository documentation cannot enter the archive.

Mozilla signing is a separate workflow. After AMO returns a signed XPI, validate and store it with:

```powershell
.\Relay\import-signed.ps1 -SourcePath C:\path\to\mozilla-signed.xpi
```

Signed imports must contain the same bounded Relay payload plus Mozilla `META-INF` signature records. They are written beneath `artifacts/Relay/<version>/signed/` and are never synthesized or labelled as signed locally.

Configured ScummVM targets are supported through optional `arcade-scummvm: 1`; use compatible Arcade 0.2.15, Host 0.2.6, Relay 1.1.6 and Portal 0.12.10 releases. Older sessions retain Spectrum browsing. See the [exact target and native migration contract](../docs/architecture/arcade-scummvm-adapter.md#optional-transport-and-native-approval-migration).

Relay also caches one bounded Portal-owned theme presentation for Arcade. Only registered Portal pages may publish it and only registered Arcade pages may read it. This cache contains validated visual tokens only, and is independent of native settings profiles and the Portal database.


Arcade transfers are bounded across complete responses. Queued native requests have count/byte/deadline limits and Arcade session checks at dispatch. Optional `arcade-gameboy: 1` is negotiated independently of existing adapters.
