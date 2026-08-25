# Phase 7 Relay Packaging

Recorded on 2026-08-25. Relay packaging is restored beneath the ignored repository artifact root without reintroducing Host or runtime files into the extension boundary.

## Package Boundary

The pre-migration `extension/package-amo.ps1` and preserved Cyrune history both define the same eight package files:

```text
background.js
content.js
icons/icon-48.svg
icons/icon-96.svg
manifest.json
popup/popup.css
popup/popup.html
popup/popup.js
```

`tools/relay_package.py` treats this list as an exact allowlist. Unsigned archives containing any other file, duplicate/case-colliding entry, unsafe path, oversized entry, or excessive total content are rejected. Consequently Host code, installers, tests, local configuration, databases, backups, credentials, changelogs, and repository documentation cannot enter a Relay upload archive.

## Unsigned AMO Workflow

From the repository root:

```powershell
.\Relay\package-amo.ps1
```

The wrapper runs `web-ext lint`, then creates a deterministic ZIP beneath:

`artifacts/Relay/<version>/unsigned/`

The directory contains the AMO-upload ZIP, a SHA-256 sidecar, and a content-free `package-report.json`. ZIP entry order, timestamps, permissions, compression level, and content are normalized, so identical Relay source produces the same archive hash regardless of checkout path.

Relay 1.0.54 result:

- Archive: `cyrune-relay-1.0.54-amo-upload.zip`
- Bytes: 30,916
- SHA-256: `9794436F45EBDA587C390DBD4DB148E9F19825B198760279AF404B2CFE738D6A`
- Source fingerprint: `DB4E659FBB10CADDFEEC9A12771EE13C8B35A5EBD1814DBDCDA8ABECBB2AA2C0`
- Entries: exactly 8
- `web-ext lint`: zero errors, notices, or warnings

The artifact path is ignored by `.gitignore` and does not appear in Git status.

## Pre-Migration and Clean-Checkout Comparison

The preserved legacy archive `morpheus-webhub-1.0.8-amo-20260722-111645.zip` validates against the exact same eight-file allowlist:

- Bytes: 11,824
- SHA-256: `1779B554631AE2E5E79FE3E0AD155064DD70813F055E842D2EE5BA6FEC579F53`

Its content bytes differ because it is the older Relay 1.0.8 release; the bounded archive structure is unchanged.

A clean local clone of commit `c3213c5` was created at a different absolute path containing spaces and the Unicode character `Ω`. Building its committed Relay 1.0.54 payload with the new deterministic tool produced SHA-256 `9794436F45EBDA587C390DBD4DB148E9F19825B198760279AF404B2CFE738D6A`, exactly matching the working checkout. The clean clone remained clean after packaging because output was directed to an external temporary artifact root.

## Mozilla-Signed Workflow

Local tooling does not create or label an XPI as Mozilla-signed. Upload the unsigned ZIP to AMO, then import the XPI returned by Mozilla:

```powershell
.\Relay\import-signed.ps1 -SourcePath C:\path\to\mozilla-signed.xpi
```

The import requires:

- the preserved compatibility extension ID and matching component version;
- all eight core entries byte-identical to the current Relay source;
- no non-Relay entries except bounded `META-INF` signature metadata;
- an RSA signature entry;
- a successful hash-verified atomic copy.

Validated signed packages, sidecars, and reports live beneath `artifacts/Relay/<version>/signed/`. Firefox remains the authority that cryptographically validates Mozilla's signature when installing the XPI; the repository tool validates package structure, identity, source correspondence, and copy integrity.

## Version Alignment

`tools/validate_versions.py` validates component versions independently:

- Portal's `APP_VERSION` must match both displayed fallbacks.
- Relay's manifest version must be valid and have a corresponding Relay changelog entry.
- Portal and Relay versions are not required to equal one another.

The check is part of `tools/validate.ps1`, along with packaging tests and `web-ext lint`.

## Coordinated Validation

The final combined-checkout run passes:

- 88 Portal tests;
- 253 Widget tests;
- 8 Relay tests;
- 42 Host tests plus 11 parameterised subtests;
- 10 runtime-migration tests;
- 14 packaging tests;
- 67 Arcade tests;
- all JavaScript syntax checks, Relay manifest parsing, and independent Portal/Relay version checks;
- `web-ext lint` with zero errors, notices, or warnings.

Validation initially exposed a Host continuation-token race when a same-size atomic database replacement retained the prior filesystem timestamp. Chunked database and backup reads now combine metadata with SHA-256 content identity. The deterministic regression passed 20 consecutive focused runs before the complete validation matrix passed.

## Rollback

Generated artifacts can be discarded and rebuilt because they contain no authoritative data. To roll back packaging code, restore the previous Relay wrapper and remove the Phase 7 tooling/tests in one code change; do not alter the Relay runtime payload, Host registration, external runtime data, or preserved signed packages. The legacy checkout and its existing `dist` artifacts remain untouched recovery references.
