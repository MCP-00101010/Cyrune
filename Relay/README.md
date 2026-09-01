# Cyrune Relay

Cyrune Relay is the Firefox-compatible WebExtension that authenticates trusted local Portal, Arcade, and Nexus pages, routes browser actions and durable intake, and maintains the persistent connection to Cyrune Host. Each local application has an exact, independently registered role; authority is never shared merely because pages are in the same checkout.

For shared variables, Relay maps Portal and Arcade roles to fixed Host-owned profiles and broadcasts only numeric settings revisions. A page cannot request another component's profile or provide setting paths. Relay also requires the authoritative Arcade profile to explicitly allow optional network access before it fetches remote artwork; an unavailable or denied profile fails closed.

Portal persistence uses Host's fixed-purpose disk operations when configured and a versioned Relay-owned snapshot otherwise. Both modes expose revision/content hashes, compare-and-swap saves, serialized writes, verified legacy migration, and cross-tab change broadcasts. Relay's bounded intake queues sanitized Inbox, Import Manager, and Arcade deliveries while Portal is closed, deduplicates by delivery ID, reports pending state, and replays through a single ordered drain. Relay transports portable content and opaque metadata but does not choose native targets. Arcade artwork requests accept only HTTPS URLs on the declared scraper/CDN host allowlist, recheck redirects, and lose their authenticated registration immediately when the page navigates.

Authenticated Portal, Arcade, and Nexus registrations must advertise the current minimum role protocols. Relay rejects missing or older clients with an actionable compatibility error, and treats a Host missing the current `host-native` protocol as unavailable without disabling Relay-owned Portal authority.

The unpackaged extension root is this directory. Native Python, installers, configuration, and launchers live exclusively in `../Host/` and must not be included in Relay packages.

## Architecture and Guidance

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
