# Cyrune Relay

The toolbar popup groups Send to Portal, Focus & activity and Browser tools in a
compact category rail. Timer & Activity Tracker groups Timers, Activity and
Blocking in the same layout. Content scrolls independently; narrow windows use a
horizontal category row. Optional explanations use tooltips, while errors and
recovery guidance remain visible in the relevant category. These presentation
choices do not change browser permissions, storage choices or site-rule defaults.

Cyrune Relay is the Firefox-compatible WebExtension that authenticates trusted local Portal, Arcade, and Nexus pages, routes browser actions and durable intake, and maintains the persistent connection to Cyrune Host. Each local application has an exact, independently registered role; authority is never shared merely because pages are in the same checkout.

For shared variables, Relay maps Portal and Arcade roles to fixed Host-owned profiles and broadcasts only numeric settings revisions. A page cannot request another component's profile or provide setting paths. Relay also requires the authoritative Arcade profile to explicitly allow optional network access before it fetches remote artwork; an unavailable or denied profile fails closed.

Portal persistence uses Host's fixed-purpose disk operations when configured and a versioned Relay-owned snapshot otherwise. Both modes expose revision/content hashes, compare-and-swap saves, serialized writes, verified legacy migration, and cross-tab change broadcasts. Relay's bounded intake queues sanitized Inbox, Import Manager, and Arcade deliveries while Portal is closed, deduplicates by delivery ID, reports pending state, and replays through a single ordered drain. Relay transports portable content and opaque metadata but does not choose native targets. Arcade artwork requests accept only HTTPS URLs on the declared scraper/CDN host allowlist, recheck redirects, and lose their authenticated registration immediately when the page navigates.

Relay remembers the selected Portal store using only a versioned `host` or `relay` marker. A Host disconnect or failed native write keeps Host selected and makes Portal read-only. On the first update without that marker, successful Host configuration discovery selects the store; if discovery is unavailable, open the Relay popup and explicitly choose **Use Relay storage** for a browser-owned installation, or reconnect Host for a configured database. Existing snapshots remain intact and are not copied between stores. A later Host connection does not override an explicit Relay choice. Use Portal's storage settings to change the selection through the existing confirmed Host configuration operation.

Authenticated Portal, Arcade, and Nexus registrations must advertise the current minimum role protocols. Relay rejects missing or older clients with an actionable compatibility error, and treats a Host missing the current `host-native` protocol as unavailable without disabling an already-selected Relay-owned Portal authority.

The optional catalogue transport uses a dedicated persistent Host connection per authenticated Portal session, with bounded transient search/detail/bind requests, independent Host canonical-page authorization, queue deadlines, and revocation on navigation or disconnect. Session handles stay inside Relay; transient catalogue pages, detail records and artwork responses never enter extension storage or intake. Approved portable game items may retain a bounded public catalogue ID for explicit shortcut repair; it contains no native target or launch authority. Catalogue v1 includes selectable `available` entries for direct library browsing; exact launch readiness is checked on Add and launch. See the [direct browsing record](../docs/architecture/portal-arcade-spectrum-migration.md#direct-library-browsing--2026-09-07).

The unpackaged extension root is this directory. Native Python, installers, configuration, and launchers live exclusively in `../Host/` and must not be included in Relay packages.

## Architecture and Guidance

For automatic loading of the unpackaged development extension at Firefox startup,
see [Firefox development autoload and recovery](../docs/development/firefox-relay-autoload.md).
It records the installed AutoConfig files, full restore instructions, diagnostics,
and rollback. This is a local development setup, separate from signed packaging.

Catalogue artwork accepts only Host-normalized PNG responses. Relay checks ownership, dimensions, chunk checksums, decompressed size, and scanline shape before page delivery. The [artwork contract](../docs/architecture/portal-arcade-spectrum-migration.md#implemented-local-artwork-and-read-leases--arcade-026-host-023-relay-113) records the supported subset.

- [Relay instructions](AGENTS.md) define authentication, authority, compatibility, storage, packaging, and validation invariants.
- [Component boundaries](../docs/architecture/component-boundaries.md) define Relay's browser and routing ownership.
- [Portal–Arcade contract](../docs/architecture/portal-arcade-contract.md) defines canonical clients, role separation, bounded messages, and delivery rules.
- [Nexus contract](../docs/architecture/nexus-contract.md) defines the exact Nexus role, fixed settings/status/document operations, redaction, and revision rules.
- [Infrastructure contract](../docs/architecture/infrastructure-contract.md) defines Relay's manifest, runtime protocol/capability advertisements, compatibility register, and release gates.

## Native right-click menu

The Relay popup offers **Restore native right-click menu**, off by default. Enable it to prevent ordinary websites from cancelling Firefox's normal link, image and video context menus. **Allow this site's own menu** adds an exact-host exception (shared across HTTP/HTTPS and ports, but not subdomains); embedded frames follow the top-level site's choice. Up to 256 exceptions are retained in browser-local extension storage. These preferences do not require Portal or Host.

Changes apply to open eligible tabs; after updating Relay, reload a page if its earlier window-level handler still takes precedence. Local Cyrune pages, localhost and Firefox-protected pages are excluded. Overlays can obscure the real media target, and restoring a menu does not make protected media downloadable. Shift-right-click remains Firefox's built-in temporary override.

## Browser utilities and saved refresh

Expand **Browser utilities** in the popup for independent text-selection, copy and paste restoration switches (off by default). **Allow this site's restrictions** exempts the exact top-level hostname, including its embedded frames. This is separate from the native-menu exception. Firefox-protected and local Cyrune pages remain excluded.

Copy the current page, Firefox's selected tabs, or the current window as URLs, title/URL lines, or Markdown. The **Cyrune utilities** context menu also offers link-text copying and the same link formats. Its three action groups can be disabled independently in the popup. Selected-tab and window exports omit private and non-web tabs; clipboard permission is write-only, with no clipboard reading or history.

Select part of a page and right-click to collect its HTTP(S) links in document order, removing duplicate URLs. Copy up to 200 links, explicitly open up to 20 in background tabs, or send them through the existing durable Portal Import Manager queue. No page scan or import happens without that action; normal Portal review still applies. Private-window selections cannot be queued to Portal.

**Timer & Activity Tracker** has its own clock button at the right of Firefox's address bar on eligible web pages and Relay's blocked pages. Its reload card has an enable checkbox and an interval from 10 seconds to 24 hours. Edits save automatically; turning the timer off retains its interval. The other cards choose the domain's category, independent Distracting flag, exclusion and daily or focus blocking. Firefox controls the precise ordering of address-bar buttons. These controls are separate from the main Relay toolbar popup.

Relay remembers one interval per whole domain, including subdomains, and resumes matching pages after reopening or restarting Firefox. Each eligible tab has its own timer. Settings stay in browser-local extension storage, capped at 256 domains, outside Portal data. Earlier per-page timers migrate with their original records retained; conflicting choices pause the new domain timer for review.

Periodic reloads run only in background tabs. The selected tab in every Firefox window is protected, including windows without focus. Switching away starts a fresh full interval; returning cancels the pending timer and never triggers a catch-up reload. Other background tabs retain their own deadlines. This is the fixed default, with no additional popup option or pause label.

The separate **Unload after** card below the reload timer unloads inactive tabs to release page memory and CPU work. It is off by default, starts at 15 minutes, and accepts 1 minute to 24 hours. Changes save automatically for the whole domain and its subdomains; each tab measures its own time since last selected. Firefox reloads the page when you select the tab again. Active, pinned, private, audio-playing, muted and edited-form tabs are protected. Muted tabs are conservatively protected because Firefox can report their audio as inaudible. Form protection lasts until normal navigation/reload. Reload timers pause while a tab is unloaded. After Firefox or Relay restarts, open tabs receive a fresh inactivity interval.

Loading/discarded tabs, private tabs, local pages and unavailable/protected documents are skipped. Editing a form or contenteditable area in the page or an embedded frame suppresses automatic reloads until a normal page reload. Navigating within the domain inherits its interval; navigating to another domain stops the previous domain’s timer for that tab. Alarms may run late while Firefox or the computer sleeps; they never create catch-up reload bursts.

The clock popup shows live countdowns, last completion times and skip reasons for that tab. A sleep symbol prefixes its title immediately before unloading (and is removed on cancellation); a reload symbol appears for three seconds after an automatic reload finishes. Firefox controls the tab font, loading animation and cached thumbnail. Form protection follows genuine user input, including injected frames, and ignores site-generated events and untouched editor markup. Late injection conservatively protects existing standard text/file drafts; it cannot reconstruct prior edits in rich editors. Reload open pages once after upgrading Relay to replace their old content handlers and clear earlier false-edit flags. Feed ordering and thumbnail changes are not reliable substitutes for confirmed reload/discard state.

Each timer card has one **Pause this tab** selector: **No pause**, **30 minutes**, **1 hour** or **Until closed**. Reload and Unload pause independently, with separate deadlines. Resuming or expiry gives only the affected timer a fresh eligible interval. Pauses apply to the current tab/domain and clear on another domain, tab close or Relay restart; saved domain rules remain intact. The overview keeps explicit bulk actions for pausing both timers, keeping tabs awake or resuming both.

The domain appears once in the shared clock-popup header, above its category navigation. Activity has separate tracking and **Distracting site** cards. Distraction, daily allowance, warning and block-at-limit controls stay expanded; allowance controls become editable when the site is marked distracting.

The header's **Tab timers** button opens a separate compact Relay tab with search, Timers/Unloaded/All web tabs filters, paged status rows and bulk overrides/resume. Private and non-web tabs are omitted. Bulk actions apply to at most 100 explicitly selected tabs and recheck their domains; the view contains transient browser metadata only.

Use **Daily allowance** in the expanded **Distracting site** card for a flagged site. Enable a daily minute limit, an optional advance warning (0 disables it), and optional blocking at the limit. Usage sums tracked active browsing across the domain's subdomains and resets at local midnight. Existing tracking consent, idle, private and exclusion rules apply: paused, disabled or excluded tracking accrues no usage. Allowances never enable collection themselves. Warnings and reached-limit notifications are emitted at most once per domain/day/threshold. Blocking covers already-open pages and subsequent navigation while Portal is closed; ending a restriction leaves reopening explicit.

Relay 1.6.1 converts early allowance records automatically while keeping their original backup. An unsupported allowance record stays intact and shows its error inside Daily allowance; other site settings remain available.

The Activity tracking card shows today's tracked time for the whole domain in its top-right corner while collection is enabled. The compact minute/hour total refreshes every five seconds while open, remains visible during pauses, and hides when tracking is disabled. It uses the current local day independently of daily allowance settings.

## Tests

```powershell
node --test "Relay/tests/*.cjs"
npx --yes web-ext lint --source-dir Relay
```

For native menu acceptance, run `python tools/validate_relay_native_menu_firefox.py` from the repository root with `marionette-driver` installed. It uses a disposable Firefox profile, isolated native-data overrides and loopback fixtures; screenshots are written outside the checkout.

`python tools/validate_relay_utilities_firefox.py` validates real selection/copy/paste, clipboard formats, context-menu link collection and queued Portal intake, timer execution, edited-form suppression, reopening, background restart and the timer enable/disable checkbox. It uses the same isolated setup.

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


Relay 1.4.0 owns a profile-wide Focus timer and optional Browser Activity collection while Firefox is running, even with Portal closed. Use Focus Session and Browser Activity widgets for controls and reports; the Relay popup provides pause/resume/stop. Tracking is off until explicitly enabled, stores hostname/duration only, excludes private and unsupported pages, and pauses when Firefox loses focus or the user is idle/locked. Browser-local records do not sync with Portal exports. See [productivity services](../docs/architecture/productivity-services.md) for recovery, retention and deletion.


Relay 1.4.0 renames the address-bar clock to Timer & Activity Tracker. Its three cards manage whole-domain reload intervals, activity categories/exclusions, and daily or running-focus blocking. Blocking permissions prevent matching HTTP(S) navigation before loading the site and replace already-open matching tabs with a centered rule message. Reopening after a restriction ends is manual. Site scope uses the bundled Public Suffix List, including private suffixes. Earlier per-page timers and activity choices have recoverable migrations; see the productivity contract.

Website categories use twenty topic-based defaults, with names only, alphabetical ordering and Uncategorized last. Existing custom and ambiguous Work/Productivity/Personal/Shopping assignments remain available for manual review. Schema-4 migration renames clear matches and retains the original assignments in `categoryMigration.backup` before committing. Automatic first-visit classification is not enabled.
