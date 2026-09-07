# Arcade native import manifest

Arcade 0.2.13 introduces native import manifest schema 1 and the managed Spectrum adapter. Arcade 0.2.14 adds the [configured ScummVM adapter and exact launch preflight](arcade-scummvm-adapter.md). The running Spectrum catalogue and import discovery share row identity and metadata normalization. Installing new collections through the manifest and merge/apply jobs remain subsequent work. Arcade 0.2.15 adds configured ScummVM source setup, catalogue admission and independently validated Host launch.

## Ownership and authority

This format belongs to Arcade's native core. It is not the public catalogue projection, a Portal export, a Host approval, or a new Relay operation. A native caller supplies the local source root separately. Manifest data contains no root, executable, emulator/profile binding, arguments, environment, command, or opaque game approval. Unknown fields, adapters, target kinds and schema versions fail closed.

References include private relative filenames and must stay within Arcade/Host or a user-controlled native draft outside the checkout. The draft does not replace source metadata or any persisted favourites, history, POK database or launch policy. It grants no permission to adopt an existing collection identity or change its root. Future apply must validate source association, current files, revisions and explicit mutation scope, then use the recoverable collection lifecycle.

## Schema 1

The JSON envelope has exactly `schemaVersion`, `source`, and `entries`. Limits are 32 MiB UTF-8 and 100,000 entries. The reader rejects duplicate object keys, invalid JSON constants and oversized inputs. Validation returns a detached normalized object.

`source` contains exactly `id`, `adapter`, and `platformId`. The source ID is the native collection identity selected by the caller (1–120 ASCII letters, digits, underscores or hyphens), retained independently of its display name. It is not a public catalogue source ID or an approval. Registered pairs are `spectrum-managed-v1` / `zx-spectrum` and `scummvm-config-v1` / `mixed`. Older readers reject the new adapter rather than treating its directory as media; existing Spectrum manifests retain their exact schema.

Each entry has exactly:

| Field | Meaning |
| --- | --- |
| `id` | Exact native entry identity, using the same ID bound as the source; duplicates fail rather than merge. |
| `metadata` | `title`, `hardwareLabel`, `editionLabel`, `year`, `publisher`, `description`, `languages`, `countries`, `suggestedTags`; same text/list limits as the public catalogue presentation. |
| `target` | Discriminated native target descriptor: `{kind: "media-file", path}` for Spectrum, or the separately validated [ScummVM game-directory/registration descriptor](arcade-scummvm-adapter.md#native-source-and-identity). |
| `artwork` | Up to two references with `role` (`loading-screen` or `screenshot`) and either `{kind: "local-file", path}` or `{kind: "remote-image", url}`. |
| `supportFiles` | Up to 128 explicit `{role: "pok", kind: "local-file", path}` references. |
| `provenance` | One to four `{provider, recordId}` observations, bounded to 80/160 plain-text characters. These report origin, not confidence or authority. |

Local references reject absolute paths, traversal, Windows device aliases, alternate streams and ambiguous Windows filenames. Review resolves every local reference against the separately supplied real root, including symlink checks. Duplicate media targets compare case-insensitively and are rejected; same-title releases with different exact targets remain independent.

Remote artwork is untrusted provenance only. URLs must be HTTPS, without user information, query strings, fragments or nonstandard ports. Discovery/review does not fetch, render, or resolve them over the network; review reports `remote-artwork-unchecked`. Any future acquisition must separately enforce the authoritative optional-network permission, provider/redirect allowlists and bounded decoder rules. Existing catalogue thumbnail behavior remains unchanged.

## Spectrum compatibility

`import_spectrum.py` reads only `collection-metadata.json`, retaining Main rows and the existing whole-source duplicate-ID/path checks. It preserves explicit game IDs. Missing IDs use the exact legacy lowercased SHA-1 input, including original path separators; normalization happens separately for the target path. Renaming a record with a retained ID preserves its native identity. Public IDs still come exclusively from the existing prepared mappings or private runtime identity key.

48K, 128K, enhanced releases and translations remain exact independent records. An existing combined 48K/128K release stays one entry. System is authoritative and memory is its fallback during direct browsing/discovery. The previously prepared catalogue keeps its existing stricter compatibility checks. Edition labels retain the existing version, demo, development, hardware, language and country projection.

Explicit POK links stay attached to their original entry. Existing POK title/memory fallback matching remains in `GameLibrary`, and existing metadata is never rewritten from this draft. Collection metadata is always recorded as provenance; an existing scraper provider/record pair is retained when present. Invalid source data fails discovery rather than silently dropping a game or granting it a substitute target.

## Discovery and review

`Arcade/tools/inspect_import.py --spectrum-source SOURCE_ID --root COLLECTION` produces a reference-check report. `--emit-manifest` prints the native draft instead, without media checks. `--manifest FILE --root COLLECTION` validates/reviews a saved draft. The tool writes no files itself and returns 0 for a clean report or emitted draft, 2 for review issues, and 1 for an invalid/unavailable source or draft.

Reports contain entry IDs and fixed issue codes, plus a digest of the normalized manifest. They contain no resolved target paths. The digest is not a filesystem revision or approval: files may change while the manifest stays identical. Review opens no media contents and neither hashes nor launches them. Missing artwork/POKs are identified separately from missing targets. Browser search never calls this review path and requires no import/preparation steps.

ScummVM is the first new adapter after this baseline, with native discovery/review and launch preflight implemented in 0.2.14 and configured catalogue/Host integration in 0.2.15. DOSBox configurations, disc manifests and MAME machines still require their own validators; unknown targets never fall back to `media-file`. Portal/Relay/Host catalogue admission must be extended and validated separately before any new target can be selected or launched there.

## Validation — 2026-09-07

The coordinated validator passed all component and cross-component suites, JavaScript syntax, infrastructure/version checks and Relay lint (zero findings). Arcade's 262 tests include 35 import checks: native draft round trips, running-catalogue parity, editions and aliases, POK references, authority rejection, schema bounds, path confinement including actual symlink escapes, unfetched remote artwork and 12,933-entry synthetic metadata-only discovery. Focused Ruff F checks also passed.

The existing non-launching live preflight passed for the 12,933-game library. Read-only discovery covered all 12,926 Main metadata entries and retained 25 remote artwork references. Collection metadata stayed byte-for-byte unchanged; benchmark identity/config files lived only in a disposable runtime. Without allocation tracing, one-source catalogue browsing measured 0.9102 seconds cold and 0.0198 seconds warm, with draft discovery taking 0.9044 seconds. These measurements do not claim ScummVM readiness or import/apply acceptance.
