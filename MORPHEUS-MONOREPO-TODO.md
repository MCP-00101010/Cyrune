# Morpheus Monorepo and Infrastructure TODO

## Status

- **State:** Planned
- **Created:** 2026-08-24
- **Source:** Refines the ideas in `Infrastructure TODO.md` into an implementation plan.
- **Primary objective:** Bring Morpheus WebHub, Morpheus EmuGUI, the Firefox extension, and the native host into one repository without losing either application's history, data, credentials, bindings, development workflow, or rollback path.

This plan deliberately separates filesystem/repository migration from behavioural changes. A folder move, runtime-data migration, extension-required WebHub cutover, shared-code extraction, and new product features must not ship as one indivisible change.

## Agreed Architecture Principles

- Keep WebHub and EmuGUI as distinct applications with distinct interfaces and product responsibilities.
- Use one repository and one coordinated validation workflow without forcing both applications into one runtime or UI framework.
- Keep the Firefox extension narrow: authentication, routing, durable intake, browser APIs, extension-owned state, and persistent native transport.
- Keep OS and filesystem authority in the native host: files, processes, application bindings, game bindings, credentials, approved directories, Explorer intake, and native configuration.
- Keep EmuGUI authoritative for game libraries, metadata, artwork, scrapers, emulators, profiles, and launch decisions.
- Keep WebHub authoritative for boards, tabs, columns, folders, Hub tags, widgets, Inboxes, Import Manager content, and compact launcher presentation.
- Keep native paths, command templates, profile paths, credentials, and other machine-local authority out of the portable Hub database.
- Extract shared packages only where there is a real second consumer and a stable contract.
- Preserve direct `file://` development and ordinary page reloads for both interfaces.
- Keep EmuGUI on its single authenticated extension/native transport; do not carry its retired localhost HTTP server into the monorepo.
- Treat generated extension packages as build artifacts, not source files.
- Make every data or path migration copy-first, verified, recoverable, and idempotent.

## Target Repository Layout

```text
Morpheus/
  apps/
    webhub/
      index.html
      source/
      assets/
      backgrounds/
      themes/
      vendor/
      tests/
    emugui/
      web/
      emugui_service.py
      emugui_core/
      defaults/
      tools/
      tests/
  extension/
    manifest.json
    background.js
    content.js
    popup/
    icons/
  native-host/
    morpheus_host.py
    install.ps1
    install.sh
    host launchers and manifest templates
  packages/
    bridge-client/
    design-tokens/
    item-contracts/
    search-providers/
    widget-sdk/
  widgets/
  tests/
    integration/
  tools/
  docs/
  artifacts/                 # generated; ignored by Git
  AGENTS.md
  CHANGELOG.md
  TODO.md
  MORPHEUS-MONOREPO-TODO.md
  README.md
```

Initial moves should preserve each application's existing internal shape. In particular, do not add an extra `source/` layer beneath EmuGUI merely for symmetry; `emugui_service.py`, `emugui_core/`, `web/`, and `defaults/` already form a coherent application root.

## Intended Runtime Data Layout

Move mutable device-local data outside the source checkout:

```text
%LOCALAPPDATA%/Morpheus/
  native-host/
    config.json
    logs/
    intake/
  webhub/
    morpheus-webhub.json
    backups/
  emugui/
    config.json
    state.json
    emulator-profiles/
    logs/
    cache/
```

Environment/configuration overrides should remain available for portable and development installations. The default location must no longer depend on where the Git checkout happens to live.

## Component Boundaries

### `apps/webhub`

- Hub interface and rendering.
- Board, tab, column, folder, Set, Inbox, Import Manager, Trash, Undo, and search behaviour.
- Hub tag catalogue and tag groups.
- Widget host and Hub-specific widget presentation.
- Compact bookmark, application, and game launcher items.
- Extension client usage, but no direct native filesystem/process access.

### `apps/emugui`

- Game collection discovery and indexing.
- Metadata, artwork, scraper, incoming, review, language, and trash workflows.
- Emulator and managed-profile configuration.
- Game/POK launch orchestration and testing.
- External HTML/CSS/JavaScript interface.
- Transport-independent API dispatch and low-level filesystem/network adapters loaded by the native host.

### `extension`

- Exact-page registration and per-tab authentication.
- WebHub and EmuGUI client-role separation.
- Browser tab, bookmark, menu, notification, alarm, session, and storage APIs.
- Persistent native messaging connection.
- Durable pending-intake queue.
- Delivery acknowledgements and conflict-aware retry routing.
- No EmuGUI business logic and no native path authority.

### `native-host`

- Shared database and backup I/O.
- Secret storage.
- File and directory pickers.
- Approved application and game bindings.
- Process launch/reveal operations.
- Approved directory/Git/recent-file services.
- EmuGUI Python-service loading.
- Native Explorer/Send To intake spool.
- No portable Hub UI state and no application interface code.

### `packages`

Start with small, contract-oriented packages:

- `bridge-client`: common request IDs, response correlation, timeouts, reconnect events, and transport envelopes; keep WebHub and EmuGUI adapters separate.
- `design-tokens`: colours, spacing, typography tokens, icon references, and neutral controls that genuinely match both applications.
- `item-contracts`: sanitisation and versioned portable shapes for bookmarks, applications, games, queued imports, and delivery receipts.
- `search-providers`: pure provider definitions and safe query URL construction usable by Universal Search and EmuGUI's Search Web action.
- `widget-sdk`: the host-neutral descriptor/capability/cache contract after its WebHub dependencies have been audited.

Do not put filesystem access, process launching, secrets, application bindings, game bindings, or authorization policy into a generic browser `core` package.

## Phase 0 — Freeze, Inventory, and Recovery Assets

- [ ] Confirm both worktrees are clean apart from explicitly preserved user files.
- [ ] Record current WebHub, extension, and EmuGUI versions.
- [ ] Tag the last pre-monorepo commits in both repositories.
- [ ] Create a Git bundle of the EmuGUI repository because it has no remote.
- [ ] Create a normal backup of the WebHub repository or confirm the pushed GitHub remote contains the current branch.
- [ ] Record the current Git commit IDs and active branches.
- [ ] Inventory every ignored/local runtime file in both repositories without printing credentials or embedded icon data.
- [ ] Record the current native-host registry manifest path and launcher path.
- [ ] Record only hashes, sizes, and locations for:
  - the active Hub database
  - Hub database backups
  - native-host configuration
  - EmuGUI configuration and state
  - managed emulator profiles
- [ ] Confirm secure scraper credentials are present in Windows Credential Manager and absent from JSON.
- [ ] Record the current `emuguiRoot`, database path, approved game count, approved application count, and approved directory count without exporting sensitive values.
- [ ] List browser bookmarks or pinned shortcuts that point at the old WebHub and EmuGUI `file://` URLs.
- [ ] Create an `infra/monorepo` branch in the WebHub repository.

### Phase 0 exit gate

- Both repositories can be restored independently.
- Every important runtime file has a verified backup.
- No move or mutation has occurred yet.

## Phase 1 — Import EmuGUI History into the Monorepo

- [ ] Use the existing WebHub repository as the initial monorepo to retain its configured remote and release history.
- [ ] Import the EmuGUI `main` history beneath `apps/emugui` without squashing its 11 commits.
- [ ] Prefer `git subtree` or an equivalent unrelated-history import over copying files without history.
- [ ] Move current WebHub product files beneath `apps/webhub` using `git mv` so history remains traceable.
- [ ] Keep root-level planning, repository guidance, release notes, and infrastructure documents at the monorepo root.
- [ ] Preserve the original EmuGUI repository unchanged until the combined repository passes all migration gates.
- [ ] Add component ownership and paths to the root `AGENTS.md`.
- [ ] Add a root `README.md` describing how the applications, extension, and native host fit together.

### Phase 1 constraints

- Do not refactor code while importing or moving it.
- Do not change database authority or fallback behaviour.
- Do not move runtime data yet.
- Do not delete either old checkout.

### Phase 1 exit gate

- Both Git histories are visible from the monorepo.
- WebHub and EmuGUI source trees are present under their target app roots.
- A diff audit shows only path moves and root documentation.

## Phase 2 — Restore Builds, Tests, and Direct-File Operation

- [ ] Update every WebHub HTML script, stylesheet, asset, worker, vendor, and manifest-relative path.
- [ ] Update JavaScript tests to use `apps/webhub` as their root.
- [ ] Update EmuGUI test discovery and service-relative paths.
- [ ] Update native-host tests for the new location.
- [ ] Update extension packaging paths.
- [ ] Update documentation links and setup commands.
- [ ] Update the Hub and EmuGUI local page URLs used by integration tests.
- [ ] Verify WebHub still starts directly from `apps/webhub/index.html`.
- [ ] Verify EmuGUI still starts directly from `apps/emugui/web/index.html` through the extension.
- [ ] Verify no HTTP listener, port-8765 lifecycle, or frontend fetch fallback was reintroduced by the move.
- [ ] Add a root validation script that runs:
  - WebHub JavaScript tests
  - EmuGUI Python tests
  - native-host tests
  - JavaScript and Python syntax checks
  - manifest JSON validation
  - version-alignment checks
  - `web-ext lint`
- [ ] Keep component-specific commands usable for focused development.

### Phase 2 exit gate

- Both interfaces work from their new source paths.
- All existing automated suites pass before shared-code extraction begins.
- The old checkouts remain a usable fallback.

## Phase 3 — Separate and Reinstall the Native Host

- [ ] Move native-host source and installers from `extension/native` to root `native-host`.
- [ ] Keep the actual WebExtension package free of native Python, shell, installer, and runtime data files.
- [ ] Update native-host import and test paths.
- [ ] Update `install.ps1` and `install.sh` for the new host location.
- [ ] Reinstall the native-host manifest so Firefox/Zen registry entries point at the new launcher.
- [ ] Verify temporary-development and installed extension IDs remain accepted as intended.
- [ ] Add a native-host diagnostic that reports path validity without exposing private configuration values.
- [ ] Verify the persistent native process starts from the new path and survives application/game launches.
- [ ] Verify extension lint no longer sees the native Python and installer shell files.

### Phase 3 exit gate

- Firefox/Zen connects to the relocated host.
- WebHub storage, applications, games, credentials, and EmuGUI operations work through one persistent connection.
- Old registry/native-manifest paths are no longer active.

## Phase 4 — Runtime Data Externalisation and Migration

### Migration rules

- [ ] Implement one migration coordinator with a versioned receipt.
- [ ] Never delete or overwrite an old source file before the destination has been written, reread, parsed, and hash-verified.
- [ ] Copy instead of move during the first successful migration.
- [ ] Preserve timestamps where practical.
- [ ] Use atomic replacement and bounded backup retention at the destination.
- [ ] Make retries idempotent.
- [ ] Detect identical, missing, corrupt, divergent, interrupted, and already-migrated states.
- [ ] Require an explicit choice before replacing divergent data.
- [ ] Store migration receipts without database contents, paths to credentials, or secret values.

### WebHub data

- [ ] Copy the authoritative Hub JSON database to `%LOCALAPPDATA%/Morpheus/webhub`.
- [ ] Copy and validate the useful rotating backups.
- [ ] Update native configuration only after the new database rereads successfully.
- [ ] Verify revision/hash metadata remains valid.
- [ ] Preserve browser-local widget/UI data and IndexedDB assets unchanged.
- [ ] Confirm opaque application and game keys remain intact.

### EmuGUI data

- [ ] Copy `config.json`, `state.json`, managed profiles, logs policy, and any intended cache data to `%LOCALAPPDATA%/Morpheus/emugui`.
- [ ] Change EmuGUI defaults to resolve runtime data from the external location.
- [ ] Retain environment-variable/config overrides for portable or development use.
- [ ] Verify collections, favourites, recent history, emulator definitions, profile IDs, profile contents, scraper settings, and credentials.
- [ ] Verify no plaintext credential is introduced during migration.

### Native configuration

- [ ] Move native-host configuration to `%LOCALAPPDATA%/Morpheus/native-host/config.json`.
- [ ] Preserve approved application and game bindings.
- [ ] Preserve approved directory handles where their targets still exist.
- [ ] Update the configured EmuGUI app root to `apps/emugui`.
- [ ] Reapprove the Git Workspace root because the WebHub repository path and scope changed.
- [ ] Keep external application paths unchanged.

### Local-page links

- [ ] Update the user's WebHub bookmark/pinned shortcut to `apps/webhub/index.html`.
- [ ] Update the EmuGUI bookmark to `apps/emugui/web/index.html`.
- [ ] Consider temporary redirect pages at the old locations during the validation period.
- [ ] Update WebHub **Open in EmuGUI** URL construction and exact-page authorization.

### Phase 4 exit gate

- Both applications run entirely from the monorepo while using externalised runtime data.
- Existing databases, bindings, profiles, and credentials are intact.
- The old runtime files remain available as read-only recovery copies.

## Phase 5 — Extension Packaging and Release Automation

- [ ] Keep unpackaged extension source solely in `extension/`.
- [ ] Replace ambiguous locally generated `.xpi` naming with an explicit unsigned AMO upload `.zip` artifact.
- [ ] Write generated artifacts beneath `artifacts/extension/<version>/`.
- [ ] Keep `artifacts/` ignored by Git.
- [ ] Add a single build command that:
  - validates manifest syntax and version
  - validates expected source inclusion/exclusion
  - runs extension-related tests
  - runs `web-ext lint`
  - creates a deterministic upload archive
  - emits hashes and a small build manifest
- [ ] Ensure package contents exclude native-host code, installers, test data, local config, databases, backups, and credentials.
- [ ] Add a release workflow that attaches build artifacts to a GitHub release when desired.
- [ ] Treat the signed XPI returned by Mozilla as a separate certified artifact.
- [ ] Do not commit or silently replace signed packages.
- [ ] Add a version matrix for WebHub, EmuGUI service contract, extension, native host, data schemas, and shared packages.
- [ ] Replace duplicated minimum-extension-version strings with one generated or validated source of truth.

### Phase 5 exit gate

- A clean checkout can produce the same AMO upload package with one command.
- Source archives and signed artifacts are clearly distinguished.
- Extension package contents pass lint with no avoidable native-file notices.

## Phase 6 — First Shared Packages

Extract one concern at a time and rerun both applications after every extraction.

### Extension bridge client

- [ ] Define a versioned common message envelope.
- [ ] Share request IDs, correlation, timeout selection, relay-ready handling, reconnect events, and bounded error normalisation.
- [ ] Keep separate WebHub and EmuGUI capability adapters.
- [ ] Keep registration rules and authorization decisions inside extension/native authority.
- [ ] Verify exact-page checks are unchanged.

### Design tokens

- [ ] Identify the small set of colours, spacing, typography, focus, border, and control tokens genuinely shared by both applications.
- [ ] Create a neutral token stylesheet.
- [ ] Let each application retain its own layout and component CSS.
- [ ] Avoid introducing a build requirement merely to use the tokens.
- [ ] Verify direct `file://` loading of shared sibling assets in Firefox/Zen before adopting it broadly.

### Item contracts

- [ ] Define versioned bookmark, application, game, queued-import, and delivery-receipt shapes.
- [ ] Centralise bounds and sanitisation rules without centralising application business logic.
- [ ] Add contract tests consumed by Hub, extension, and native-host suites.
- [ ] Preserve path-free portable application/game records.

### Search providers

- [ ] Extract the Universal Search provider catalogue and safe URL construction into a pure browser package.
- [ ] Keep provider settings and recents owned by the consuming application.
- [ ] Support a query assembled from game title plus system name.
- [ ] Add exact provider URL and encoding tests.

### Widget SDK

- [ ] Audit global WebHub dependencies before moving the SDK.
- [ ] Define the minimum host adapter for rendering, settings, cache, credentials, networking, notifications, and cleanup.
- [ ] Keep Hub-only widgets in WebHub until another application actually implements the host adapter.
- [ ] Move only demonstrably host-neutral widgets to root `widgets/`.

### Phase 6 exit gate

- Shared packages have at least two real consumers or an explicit cross-component contract.
- Neither app acquires a bundler or server requirement solely because of extraction.
- No privileged service has moved into browser code.

## Phase 7 — Durable Extension Import Queue

### Queue ownership and shape

- [ ] Store the pending queue in versioned extension-owned storage.
- [ ] Queue only sanitised portable intake records.
- [ ] Assign a stable delivery ID before first persistence.
- [ ] Record source, creation time, optional intended destination, attempt count, and last bounded error.
- [ ] Do not queue native paths, commands, secrets, raw browser history, or oversized images.
- [ ] Define maximum item count, per-item size, aggregate size, and retention period.
- [ ] Define overflow behaviour that never silently discards the newest user action.

### Producers

- [ ] Extension popup: send current tab to Import Manager while Hub is closed.
- [ ] Firefox bookmark context menu: send a bookmark or folder while Hub is closed.
- [ ] EmuGUI: queue a game shortcut if Hub is closed after its native binding has been created.
- [ ] Native Explorer/Send To intake: import approved application/link records.
- [ ] Future extension integrations should use the same queue contract.

### Delivery

- [ ] Drain after a Hub registers and completes authoritative startup.
- [ ] Target the active Hub unless an existing valid destination was explicitly selected.
- [ ] Preserve FIFO order.
- [ ] Send bounded batches.
- [ ] Remove queue entries only after the Hub confirms persistence.
- [ ] Retain and retry after extension reload, Hub reload, native disconnect, save conflict, or temporary storage failure.
- [ ] Rebase once through the existing Import Manager conflict path.
- [ ] Deduplicate by delivery ID in both the extension and Hub.
- [ ] Expose pending count and last error in the popup.
- [ ] Let the user inspect, retry, or discard queued entries.

### Validation

- [ ] Hub open and Hub closed.
- [ ] Multiple Hub tabs.
- [ ] Extension restart before delivery.
- [ ] Hub reload during delivery.
- [ ] Native host unavailable and later restored.
- [ ] Database conflict during delivery.
- [ ] Duplicate producer retry.
- [ ] Queue corruption and schema migration.
- [ ] Quota exhaustion and aggregate bounds.
- [ ] Expired entry handling.

### Phase 7 exit gate

- “Sent to Import Manager” means durably queued or durably saved, never merely attempted.
- No open Hub is required at capture time.

## Phase 8 — Compact Launchers in Speed Dial and Essentials

Generalise both areas from bookmark-only slots to compact launchable-item slots.

- [ ] Define accepted compact types: `bookmark`, `application`, and `game`.
- [ ] Reuse one compact launcher renderer for Speed Dial and Essentials.
- [ ] Bookmark activation opens its URL and records bookmark activity.
- [ ] Application activation launches its opaque `appKey` through the native bridge.
- [ ] Game activation launches its opaque `gameKey` through the native bridge.
- [ ] Render favicon, application icon, or system emblem according to item type.
- [ ] Show correct application/game tooltip content and binding status.
- [ ] Add application/game context actions instead of bookmark URL actions.
- [ ] Preserve edit title, tags, duplicate, move, lock, Trash, and Undo behaviour where applicable.
- [ ] Allow internal drag-and-drop from columns, folders, Inbox, and Import Manager.
- [ ] Allow readable `.url` and allowlisted protocol-link external drops.
- [ ] Continue requiring the native picker for `.exe`, binary `.lnk`, and other paths Firefox withholds.
- [ ] Preserve destination slot limits and board locks.
- [ ] Ensure portable exports replace application/game keys with fresh unbound keys on import.
- [ ] Extend Search and Smart Views to label compact application/game locations correctly.

### Phase 8 exit gate

- Bookmark behaviour is unchanged.
- Applications and games launch correctly from columns, folders, Speed Dial, and Essentials.
- No native path enters the Hub database.

## Phase 9 — Emulator Profile Change Propagation

Managed emulator profiles are already saved to disk and game bindings already store stable profile IDs. WebHub must not read or share the actual profile files.

- [ ] Keep managed profile files exclusively under EmuGUI/native authority.
- [ ] Keep Hub bindings limited to `profileId` plus safe display labels/status.
- [ ] Preserve a profile ID when editing or refreshing its managed file.
- [ ] On successful profile/emulator mutation, invalidate affected game-binding status caches.
- [ ] Broadcast a bounded “game bindings changed” event to registered Hub pages.
- [ ] Refresh affected Hub cards without requiring EmuGUI to resend the games.
- [ ] Update safe emulator/profile display labels after rename.
- [ ] Show `profile-missing` or `emulator-missing` after deletion instead of silently changing launch choice.
- [ ] Require explicit rebind only when an ID was deleted/replaced or the user chooses a different binding.

### Phase 9 exit gate

- Editing a profile in EmuGUI changes the next Hub launch without resending the game.
- Open Hub cards refresh their safe status/labels automatically.

## Phase 10 — EmuGUI Search Web Actions

- [ ] Add **Search Web** to the selected-game details and context menu.
- [ ] Build the default query from bounded game title and system name.
- [ ] Use the shared provider catalogue and safe HTTPS templates.
- [ ] Offer a default provider action and a **Search with…** submenu.
- [ ] Open searches only from explicit user actions.
- [ ] Keep query recents browser-local if EmuGUI records them at all.
- [ ] Keep metadata scraping separate from ordinary web search.
- [ ] Offer **Search TheGamesDB metadata** only when its scraper is configured.
- [ ] Avoid sending ROM paths, profile names, or private collection metadata to search providers.

### Phase 10 exit gate

- A game can be searched by title and system without duplicating Universal Search provider definitions.
- Scraper and ordinary browser-search behaviour remain clearly distinguished.

## Phase 11 — Windows Explorer and Send To Integration

### MVP: Send To helper

- [ ] Create a small native intake helper separate from the native-messaging stdio entry point.
- [ ] Install a per-user **Send to → Morpheus Import Manager** shortcut.
- [ ] Accept a bounded number of explicitly selected paths.
- [ ] Initially support:
  - `.url` Internet Shortcuts
  - approved application executables
  - supported Windows shortcuts when the native helper can resolve them safely
- [ ] Treat the Send To invocation as an explicit user gesture, but still validate every target.
- [ ] Create/reuse opaque application bindings before producing portable queue items.
- [ ] Write intake records atomically to `%LOCALAPPDATA%/Morpheus/native-host/intake`.
- [ ] Have the native host drain the spool on extension/native startup, Hub registration, popup refresh, and a bounded active-session interval.
- [ ] Deduplicate using an intake/delivery ID.
- [ ] Preserve failed records with a bounded error instead of deleting them.
- [ ] Add an uninstall action that removes only Morpheus-owned Send To entries.

### Later: modern Windows 11 context command

- [ ] Revisit only after the Send To workflow proves useful.
- [ ] Evaluate an `IExplorerCommand` implementation with packaged or sparse-package identity.
- [ ] Keep Explorer menu construction fast and move real work after invocation.
- [ ] Support multi-selection and clear eligibility rules.
- [ ] Add a Morpheus icon and app-attributed command group if useful.
- [ ] Provide per-user install, upgrade, repair, and uninstall paths.
- [ ] Avoid a fragile broad registry verb when a supported packaged command is practical.

### Security and behaviour tests

- [ ] Reject unsupported, missing, remote, device, and traversal targets.
- [ ] Reject arbitrary protocol schemes.
- [ ] Bound selection count, shortcut size, icon size, and queue size.
- [ ] Verify quotes, spaces, Unicode, ampersands, and shell metacharacters are passed as data rather than commands.
- [ ] Verify the helper never constructs a shell command from a selected path.
- [ ] Verify Hub-closed capture and later delivery.
- [ ] Verify uninstall leaves user files and unrelated registry/Send To entries untouched.

### Phase 11 exit gate

- Explorer can durably send an approved application/link to the Hub Import Manager even when the Hub is closed.
- No browser-exposed filesystem path or unsafe shell execution is introduced.

## Phase 12 — Shared Tag Suggestions, Not a Shared Tag Database

The initial implementation should keep Hub tag IDs, names, colours, and groups in the authoritative Hub database.

- [ ] Add a bounded extension capability for EmuGUI to request the current Hub tag catalogue when a Hub authority is available.
- [ ] Return only stable tag IDs, names, colours, and group labels needed for selection.
- [ ] Let EmuGUI select existing Hub tags or enter new tag labels while preparing a game shortcut.
- [ ] Resolve IDs/create labels inside Hub authority at delivery time.
- [ ] Queue tag labels safely when Hub is closed and resolve them when the queue drains.
- [ ] Handle renamed/deleted tags without corrupting queued items.
- [ ] Do not make EmuGUI's game metadata depend on Hub tag IDs.
- [ ] Do not duplicate the complete Hub database into a global tag file.

### Future decision gate

Consider a genuinely shared taxonomy service only if a third application needs to edit the same tag identities. Such a service would require its own version, revision, conflict, migration, permission, and backup rules.

## Phase 13 — WebHub Required-Extension Cutover

This remains the separate migration already described in the main WebHub `TODO.md`. It must not be folded into the folder move.

- [ ] Complete the intermediate authoritative extension-storage protocol.
- [ ] Migrate legacy page snapshots with verification and explicit divergence handling.
- [ ] Preserve intentionally browser-local widget/UI/cache data.
- [ ] Preserve secrets with verified secure migration.
- [ ] Ship and validate the migration release while browser-only startup still exists.
- [ ] Only then remove browser-only main-database startup/save paths.
- [ ] Keep the native host optional for ordinary Hub use where extension storage is sufficient.
- [ ] Keep native host requirements capability-specific.
- [ ] EmuGUI normal file-mode operation continues to require both extension and native host.
- [ ] Keep EmuGUI file-mode operation on authenticated extension RPC only.

### Phase 13 exit gate

- WebHub never opens an empty database because the extension is missing or disconnected.
- Extension-required startup, disconnect, reconnect, conflict, and rescue paths pass the full cutover matrix.

## Cross-Project Validation Matrix

### Repository and path validation

- [ ] Fresh clone into a different absolute directory.
- [ ] Directory name containing spaces and Unicode.
- [ ] Existing upgraded checkout.
- [ ] Old local-page bookmark/shortcut recovery.
- [ ] Native-host reinstall after source relocation.
- [ ] No hardcoded `F:\Projects\Coding\Morpheus WebHub` or `Morpheus EmuGUI` runtime dependency.

### Data preservation

- [ ] Existing 12,933-game EmuGUI library loads unchanged.
- [ ] All configured collections remain available.
- [ ] Hub boards/tabs/columns/items match before and after migration.
- [ ] Application and game bindings retain their opaque keys.
- [ ] Managed profile IDs and file hashes match.
- [ ] Favourites and recent history match.
- [ ] Secure scraper and Hub API credentials remain retrievable.
- [ ] No plaintext secret appears in JSON, logs, exports, diagnostics, queue records, or migration receipts.
- [ ] Existing backups remain readable.

### Extension/native lifecycle

- [ ] Firefox and Zen installed extension.
- [ ] Temporary extension development install.
- [ ] Extension reload with both pages open.
- [ ] Native-host restart.
- [ ] Browser restart.
- [ ] Hub closed while EmuGUI sends a game.
- [ ] Hub opens and drains the queue exactly once.
- [ ] Native host unavailable and later restored.
- [ ] Multiple Hub tabs with active-target selection.

### Product workflows

- [ ] WebHub load/save/import/reload.
- [ ] Bookmark extension delivery.
- [ ] Application picker, icon, launch, reveal, rebind, and forget.
- [ ] Game send, launch, reveal, open in EmuGUI, rebind, and forget.
- [ ] EmuGUI collection, metadata, scrape, POK, incoming, trash, emulator, and profile workflows.
- [ ] Speed Dial/Essentials bookmarks, applications, and games.
- [ ] Explorer/Send To capture with Hub open and closed.
- [ ] Search Web provider actions.

### Automated release validation

- [ ] Complete WebHub JavaScript suite.
- [ ] Complete EmuGUI Python suite.
- [ ] Complete native-host Python suite.
- [ ] Root integration/migration fixtures.
- [ ] JavaScript and Python syntax checks.
- [ ] JSON and manifest validation.
- [ ] Version/source-of-truth alignment.
- [ ] `web-ext lint` with zero errors.
- [ ] Deterministic extension archive and recorded hashes.
- [ ] Diff checks and secret scan.

## Release and Rollback Strategy

- [ ] Use one infrastructure branch but multiple independently testable commits/releases.
- [ ] Do not delete the old EmuGUI checkout after importing its history.
- [ ] Do not delete old runtime data after externalisation.
- [ ] Keep redirect pages or documented old-to-new URL recovery during the transition.
- [ ] Keep the old native-host manifest/installer information in the migration receipt so it can be restored.
- [ ] Define rollback instructions before each phase that changes runtime paths.
- [ ] Roll back code and configuration pointers together; never point old code at a partially migrated schema.
- [ ] After a suitable real-world monitoring period, archive the old EmuGUI checkout and old runtime files rather than immediately deleting them.
- [ ] Rename the remote repository from WebHUB to a broader Morpheus name only after the monorepo works from its permanent structure.

## Explicit Non-Goals for the Initial Monorepo Migration

- Rewriting WebHub or EmuGUI in a new framework.
- Combining both interfaces into one page.
- Moving EmuGUI business logic into the extension.
- Letting WebHub read emulator profiles or ROM paths.
- Replacing Python native services with browser JavaScript.
- Creating one global mutable “core” containing unrelated privileged and UI concerns.
- Making every existing widget immediately usable inside EmuGUI.
- Shipping the Windows 11 COM shell extension in the first migration release.
- Reintroducing an EmuGUI HTTP development adapter or localhost authorization path.
- Performing the WebHub required-extension persistence cutover during the path move.

## Completion Criteria

The infrastructure overhaul is complete when:

- One repository contains the preserved histories of WebHub and EmuGUI.
- Both applications run from the documented `apps/` layout.
- The extension and native host occupy separate, correct trust/package boundaries.
- Mutable runtime state lives outside the source checkout and has a verified migration receipt.
- Existing Hub data, EmuGUI data, bindings, profiles, and credentials survive unchanged.
- A clean checkout has one documented bootstrap path and one complete validation command.
- Extension artifacts are reproducible, bounded, and clearly separated from Mozilla-signed packages.
- Shared packages are small, tested, and used across real component boundaries.
- Extension intake can be captured durably while the Hub is closed.
- Applications and games work in compact Speed Dial and Essentials slots.
- Profile changes propagate without resending game shortcuts.
- EmuGUI can use the shared safe search-provider catalogue.
- The optional Explorer Send To workflow delivers through the same durable intake contract.
- All cross-project validation and rollback checks pass.
