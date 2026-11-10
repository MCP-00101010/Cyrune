# Widget tidy review — 2026-10-24

Source review covered the shared settings renderer and the catalogue's render,
settings and interaction paths. Findings below separate implemented cleanup from
suggestions requiring their own behaviour changes. This is not acceptance of every
live API, native integration or display configuration.

## Implemented

- Remove standalone provider credits and routine explanatory footers; collect the
  integration inventory in [widget sources](widget-sources.md). Preserve errors,
  freshness, partial coverage, user-selected source identity, map copyright controls
  and per-image copyright.
- Put reusable presets in a Templates modal, opened at the bottom left of each
  widget's settings footer. Keep Done/Cancel and existing preset storage/files.
- Saving, deleting and importing templates refresh only the template list, preserving
  custom settings drafts. Apply intentionally rebuilds the draft form. Use an inline
  name field and keyboard-accessible Import button; catch storage/import failures
  inside the modal, reject other widget types and ignore late imports after closure.
- Recenter open widget settings after a viewport resize so a previously centered
  desktop panel does not leave its Done/Cancel controls outside a narrow window.

- 2026-10-25: replace Browser Activity's expanded report workflow with bounded tabbed list/pie reports and an effective site filter. Use calendar-date range arithmetic, covered across both daylight-saving transitions.

## Recommended follow-ups

1. **Folder-backed widgets: make approval side effects clear.**
   Recent Files and Git Workspace call `approveDirectory` immediately from settings,
   before Done. Cancel discards the portable draft but does not undo Host approval.
   Keep approval Host-owned; show the approved status beside the action and either
   document that lifecycle in the picker or add an explicit staged approval workflow.
   Do not revoke an existing shared approval automatically on Cancel.
2. **Media Watchlist: prevent stale search results.**
   In `_mediaWatchlistRenderSettings`, the query and type selector can change while
   an awaited search runs. An earlier query can then populate the updated form;
   the result filter also reads the current `manager.type`. Capture an identity for each search, discard
   superseded results and ignore completions after a settings form is replaced.
   Test changing Film/Series and closing/applying a template during a delayed search.
3. **Map interactions: preserve the host's drag state.**
   Global Hazards' map `restoreDrag()` sets its card's `draggable` to true on exit,
   including a card that was already locked. Portal's dragstart lock check still
   prevents moving it, but the DOM state is inconsistent. Capture/restore the prior
   value or ask the host to restore the current board policy. Test locked/unlocked
   board cards, touch completion and teardown while hovered.

## Validation scope

The initial tidy-pass coordinated validator passed 1,526 tests plus 3 Host subtests, including 309
Widget tests and 221 Portal tests, plus syntax, infrastructure, versions, Ruff and
extension lint. Disposable Firefox 158.0.1 passed template save/apply, Done/Cancel,
repeated open/close, Escape/focus return, cross-type import rejection, compact-width
overflow and rendering all 28 built-in settings forms. The repeatable check is
`tools/validate_widget_tidy_firefox.py` (requires `marionette-driver`). Live provider credentials,
network content, native approvals and every theme/text-scale combination require
separate interactive checks.

The 2026-10-25 layout/report pass passed the coordinated gate (1,541 tests plus 3 Host subtests) and isolated Firefox layout/interaction checks with synthetic reports and real Portal/MapLibre. Real Relay separately verified tracking enable/disable and compact board/sidebar hosting. See `tools/validate_widget_layout_firefox.py` and `tools/validate_productivity_firefox.py --layout-only`.
