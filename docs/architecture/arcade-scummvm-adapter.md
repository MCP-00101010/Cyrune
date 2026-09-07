# ScummVM configured-source adapter

Arcade 0.2.15, Host 0.2.6, Relay 1.1.6 and Portal 0.12.10 enable configured ScummVM collections, direct catalogue browsing, Portal Add Game, Arcade single/batch Send, and exact native launch. Source setup reads an explicitly selected existing ScummVM configuration and a separately selected library root. No catalogue preparation is required. ScummVM retains ownership of its settings, media and saves.

## Native source and identity

`import_scummvm.py` reads at most 4 MiB of UTF-8 INI data and 10,000 target sections plus 16 configuration sections. It rejects malformed INI, duplicate sections/options, case-colliding sections, NULs and inherited `[DEFAULT]` values. Global settings remain owned by ScummVM and are never copied into a manifest. Other libraries' absolute targets are excluded. Ambiguous relative configured paths require review because their meaning depends on ScummVM's working directory.

Only registrations lexically within the selected root are candidates, and each is resolved against the real root to reject symlink escapes. A missing child directory remains a reviewable candidate but fails launch preflight. Game media contents are not opened during discovery or review. Unregistered directories, including any folder labelled unsupported, are not automatically scanned or registered. The source does not assume a particular publisher/series hierarchy or infer identity from folder/title similarity.

The adapter is `scummvm-config-v1`, with source `platformId: "mixed"`. Entry IDs use `scummvm_` plus the first 32 hex characters of SHA-256 over the exact configured target ID. They survive presentation, directory and settings edits while that target ID is retained. Renaming the configured target itself creates a new candidate; no title-based identity adoption occurs. The source ID and these native aliases are not public catalogue IDs or device approvals.

The new discriminated target contains exactly `kind: "scummvm-game"`, `targetId`, `engineId`, `gameId`, `directory`, `platform`, `language`, `extra`, and `filename`. `directory` is confined relative to the selected library root. The optional `filename` is confined relative to that directory, preserving exact story selectors used by text-adventure engines. Engine/game/target IDs are bounded non-option ASCII identifiers. No executable, configuration path, command, arguments, environment, save directory or settings map is included.

Distinct configured targets remain separate, including different settings for the same data directory. Case-insensitive duplicate target IDs fail. POK support references are rejected for this adapter. The original configuration description supplies title/edition presentation; a final parenthesized edition is separated from the title. Native `extra` remains in the target descriptor. Configuration provenance retains the configured target ID. Scraping, publisher inference and artwork acquisition are not part of this adapter.

## Original platforms and languages

ScummVM is the execution adapter, not a release platform. Explicit configured aliases map to DOS, Windows, FM Towns, Amiga, Atari ST or Macintosh. An absent platform stays `unknown` / `Unspecified platform`; folder naming and engine defaults never establish it automatically. Unknown explicit platform/language codes require adapter coverage before admission. Regional English (`gb`, `us`) is normalized to `en` for presentation while the exact native selector is retained. Other admitted regional aliases likewise preserve the native value.

Support for an Atari ST release already registered in ScummVM does not add the separately deferred Atari ST/STe/Falcon collection adapter or a Hatari/STEem launcher.

## Exact launch preflight

The private preflight re-reads the existing INI, finds the exact configured target and requires its directory, engine/game identity, platform, language, extra and optional filename to match the candidate. Missing or retargeted registrations fail; another registration with the same game ID or title is never substituted. Local references must still exist and retain real-path confinement, and the selected Windows executable must exist as an `.exe` file.

It builds an argument array using `--no-console`, the explicitly selected `--config=...`, the revalidated `--path=...` directory and the exact configured target ID. ScummVM's existing native settings and saved-game semantics remain in effect. It never uses `--auto-detect`, a bare game ID, `--add`, or a shell command. Configured-target launching and the distinction between engine game IDs and target IDs follow the [official ScummVM command-line documentation](https://docs.scummvm.org/en/v2026.1.0/advanced_topics/command_line.html). The installed 2026.3.0 executable's non-launching help output was also checked.

The returned native `targetDigest` covers the selected configuration path, source root and exact target descriptor. It changes when that target is redirected, but not when a title or ordinary ScummVM preference changes. It is not a game-content hash, executable approval or reusable launch lease. Host independently validates executable/configuration/target authority, freshness, safe process execution and binding equivalence immediately before Add/launch. The preflight itself contains no process-start function; Arcade receives a Host-owned launch callback.

## Configure and use

Run the native setup tool once, with Arcade runtime configuration outside the checkout:

```powershell
python -B Arcade/tools/configure_scummvm.py --arcade-config ARCADE_CONFIG --root LIBRARY_ROOT --scummvm-config SCUMMVM_INI --executable SCUMMVM_EXE
```

The tool validates all registered targets, preserves unrelated collections/settings, saves a native backup beside the existing Arcade configuration, and atomically adds the read-only `scummvm` collection and emulator. Repeating the same setup makes no change. Conflicting IDs or roots require explicit configuration repair; they are never silently reassigned. The ScummVM INI and game files are not modified. The current active collection is preserved.

Reload Relay and both pages after updating. In Arcade, select **ScummVM** from the collection selector. Double-click a game to launch it, or use the existing single/batch **Send to Portal** actions. In Portal, use **Add Game** on a regular column and search immediately; the active Arcade collection does not affect catalogue browsing. Original platform filters distinguish DOS, Windows, FM Towns, Amiga, Atari ST, Macintosh and an unspecified platform. Same-title targets remain independently selectable. **Open in Arcade** carries the native collection ID in the page link and selects that configured collection before locating the game.

The collection row has `adapter: "scummvm-config-v1"`, native `root` and `scummvm_config`, `default_emulator: "scummvm"`, and both `writable` and `auto_metadata` false. Its emulator uses `type: "scummvm"`, the native executable path and an empty `arguments` array. Arbitrary templates, helper/profile arguments and custom working directories are not supported. Arcade's general single-file launcher rejects this adapter; registered-target launch goes through Host only. Configuration fields remain native and are not part of the catalogue projection or Portal cards.

## Arcade-owned metadata overrides (0.2.27)

The existing Arcade-only `/api/apply-scrape` route also admits registered ScummVM games. The collection's `writable` flag remains false: general metadata/file mutation routes are still blocked. Apply writes only schema-1 overrides under Arcade's runtime `scummvm-overrides/`, atomically and under a native writer lock. Hashed filenames scope records to collection ID, canonical library root and INI path. Each exact game record carries a digest of its target descriptor and bounded allowlisted presentation values; changed targets do not inherit stale overrides. Corrupt or oversized data fails without an empty-store overwrite. Older Arcade versions ignore these new files and do not modify them.

Overrides support title, release date/year, publisher, genre, developer, description, other scraper details and approved HTTPS image references. They cannot replace system/language, edition, target identity, media paths, emulator/profile policy or command authority. Images use the existing Relay provider allowlist and optional-network policy; apply stores references without remote fetching. Remote images remain Arcade presentation only, with no new Portal artwork acquisition capability.

Arcade loads overrides over registered/bundled metadata. The native catalogue watches their file stamps and updates bounded title/year/publisher/description presentation and entry revisions. Catalogue/source identities and launch target digests remain unchanged. Title-family identity retains the original registration title for generic engines, so scraping a display title does not split versions or lose a saved default. Existing Portal bindings continue to resolve and launch while any Arcade collection is active. Public message envelopes, Portal portable data and Host approval schemas are unchanged.

## Optional transport and native approval migration

`arcade-scummvm: 1` is an optional capability for all four participants. Relay opens the unchanged catalogue v1 native session, then sends fixed `ARCADE_CATALOGUE_ENABLE_SCUMMVM` with an empty payload only for a compatible Portal registration. Host checks both its release manifest and the configured/loaded Arcade adapter before enabling that session. Unsupported older native implementations retain Spectrum-only browsing. Search envelopes remain unchanged; only Host injects the private `includeScummvm` flag into Arcade. Old Portal sessions never receive ScummVM records. Public projection schema 1 and portable Portal schema remain unchanged.

Host's private ScummVM plan uses schema 2 and a distinct `adapterId: "scummvm"`. It carries exact source, configuration, target descriptor, selected directory, executable, file signatures, fixed arguments and compact presentation for independent validation. It never leaves native transport. Host approves `mode: "scummvm-entry-v1"` with source/catalogue IDs, exact target digest, canonical configuration/directory, directory device/inode identity, executable identity and working directory. The configuration/executable and selected directory/filename are rechecked before approval writes. Multi-gigabyte game trees are not content-hashed; this approval identifies the registration and directory, not every byte of media. ScummVM handles engine-specific media validation.

The first successful ScummVM approval atomically upgrades `catalogue-bindings.json` from schema 1 to 2 in the same write as the new approval. Existing Spectrum `entry-policy-v1` approvals, opaque keys and retry receipts are preserved; their record shapes do not change. Spectrum-only stores remain schema 1. Both schemas are accepted by the new Host; schema 2 never silently downgrades when its final ScummVM key is forgotten. Older Hosts reject schema 2 and must not overwrite it. Reverting binaries requires retaining the newer Host or restoring an explicitly chosen pre-upgrade native backup, with newer cards then unavailable; never erase the store to force compatibility. The initial missing-store migration receipt remains separate from this atomic envelope upgrade.

The existing aggregate 512-key limit, per-session retry identities, native locking, session revocation and bounded receipts still apply. Arcade single/batch Send uses the same checks and approval store without acquiring Portal destination authority. Explicit ScummVM rebind keeps its opaque key and invalidates old retry results for that replaced approval. Changed registration semantics, replaced directories, missing story selectors and changed executables fail closed; no title, engine/game-ID or sibling-directory substitution is allowed. Ordinary ScummVM preferences can change without rebinding because the exact target descriptor, not the entire settings file, defines the retained approval.

## Developer inspection

From the repository root:

```powershell
python -B Arcade/tools/inspect_import.py --scummvm-source scummvm --root LIBRARY_ROOT --scummvm-config SCUMMVM_INI --check-launcher SCUMMVM_EXE
```

Omit `--check-launcher` for reference review only. `--emit-manifest` produces the native draft instead; keep any redirected output outside the checkout and out of Portal portable data. The tool writes no files, starts no games and does not modify ScummVM's configuration. Its report contains native entry IDs and fixed issue codes, not absolute paths or launch arguments.

## Validation — 2026-09-07

Read-only discovery of the supplied installation found 169 configured releases under its library root: 102 DOS, 27 Windows, 10 FM Towns, two Amiga, one Atari ST and 27 with no explicit platform. All 169 passed reference review and exact launch preflight. Discovery took 0.0602 seconds; ScummVM's configuration remained byte-for-byte unchanged. No game was launched.

Synthetic tests cover independent editions, same-title targets, native settings/privacy, regional language normalization, unknown platforms, exact filename selectors, missing directories and registrations, changed target semantics, malformed/duplicate INI, symlink escapes, rejected command authority and the inspection CLI with a non-executable fixture. Spectrum's existing import and catalogue regression checks remain required. Portal admission, Host binding/rebinding and mocked native process execution are covered by the integration suite. A real game has not been started during automated validation.

The coordinated validator passed all component and integration suites, syntax, infrastructure/version checks and Relay lint (zero findings). Arcade has 285 passing tests, including 23 ScummVM checks. Focused Ruff F checks also passed without creating a repository cache.

## Integrated acceptance — 2026-09-07

The supplied native runtime is configured with all 169 registrations. Host independently validated every live plan without approving test shortcuts or starting an emulator; the ScummVM INI remained byte-for-byte unchanged. A native configuration backup is retained beside Arcade’s runtime config.

The joined Portal/content/Relay/native Host/Arcade test searches both language/platform variants, saves compact cards, preserves schema-2 approvals and executes the exact configured target through a mocked process boundary. Isolated Firefox 155.0.1 acceptance covers direct-file registration, typed search, second-row selection, mobile/desktop details, native binding, disk save/reload, source handoff and two-game Arcade delivery to Portal’s Inbox. Generated browser profiles, screenshots and synthetic runtimes remain outside the checkout. No real game launch is claimed.

Startup delivery checks also cover Portal reopening while a previous page request is pending, and authoritative storage becoming ready after an initial read-only load. Relay preserves a concurrent drain request; Portal sends its existing authenticated presence ping after successful authoritative loading/recovery to resume queued intake. Read-only and conflict guards remain in force, with acknowledgement only after authoritative saving.

Spectrum’s non-launching preflight also passed for all 12,933 indexed games and seven sampled game/emulator/profile checks, using a temporary runtime to preserve the currently selected collection. Focused Ruff F checks and whitespace validation passed.

Final coordinated validation passed: Portal 151, Nexus 26, Widgets 304, Relay 29, Host 169 plus 11 subtests, migration 21, packaging 14, tooling 8 and Arcade 285. JavaScript syntax, manifest parsing, nine registered protocols, independent component versions and Relay lint all passed with zero lint findings. The final platform-type guards also passed the focused picker/routing suites.
