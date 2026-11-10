# Portal UI Guidelines

These are durable rules for Portal-owned modals and Portal-hosted Widget settings. Outstanding rollout work belongs in the owning component TODO; completed surfaces should continue following these rules.

## Content Modals

- Use the sidebar-card panel tint/opacity while retaining modal radius, border, and shadow.
- Keep inner sections flat and compact: use transparent surfaces, subtle borders, reduced horizontal padding, and close vertical spacing.
- Align content to the true text rail rather than icon or checkbox gutters.
- Keep top-level section labels compact, in sentence case, with muted emphasis.
- Match readonly and inherited-field dimensions to editable fields unless a specific interaction requires otherwise.
- Use italic placeholders and consistent `26px` visual radio controls.
- Order tag areas as editable `Tags`, full-width `Shared` when present, then readonly full-width `Inherited`; use spacing rather than decorative dividers.
- Apply this pattern consistently to bookmark, folder, game, application, and similar create/edit flows before attempting a broader settings-panel restyle.

## Utility Modals

- Use a real footer with consistent inset/padding and a top divider for bottom actions.
- Give modal titles a full-width bottom line in the global font colour.
- Use single-row headers for Search, Inbox, Tag Manager, and Trash; use stacked headers where actions are present, currently Import Manager and Sets.
- Match the transparent/sidebar-opacity surface used by sidebar cards and do not place transparent utility modals beneath the dark overlay.

## Settings and Preview Behaviour

- Portal's main Settings modal uses a left category rail and one independently scrolling content pane. On narrow screens, use a horizontally scrolling category row. Keep Done in the header and omit a footer; the existing immediate-edit settings and explicitly saved theme previews retain their respective commit behaviour.
- Keep category selection, content heading and accessible current-category state synchronized. Support arrows, Home and End without trapping ordinary Tab navigation.
- Build settings and create/edit previews from a complete draft. Cancel restores the original object and local view; only the explicit Done or Save action may commit and persist.
- Keep focus order, Escape/Cancel behaviour, keyboard activation, labels, and control hit areas accessible when restyling an established surface.
- Reuse existing modal primitives and shared controls before adding component-specific variants.

## Context Menus

Portal and Arcade use this task order wherever the actions apply:

1. Open or launch, including alternate versions and emulators.
2. Locate or research, including Explorer and the owning application.
3. Edit or create, including metadata and properties.
4. Organize or send, including duplication, favourites and transfers.
5. Tools and device bindings.
6. Lock or unlock.
7. Remove or delete, always last and visually distinct.

Separate nonempty task groups with dividers. Keep the relative order of shared
commands consistent across placements; do not expose an unsupported action merely
to make menus identical. Empty destinations are disabled rather than clickable
placeholders. Menu text follows the user's global font colour.

Menus and submenus must fit the viewport, scroll when necessary, and keep all
commands reachable with arrows, Home/End and Escape. Submenus support keyboard
opening and returning to their parent. Opening a menu must not wait for a native
details read, and late responses must not replace a different selection's menu.

Source identity and inherited locks must be resolved again when an action runs,
a confirmation completes or an edit saves. Capture board/tab/container identity;
never silently substitute the active view for a missing captured source. Bulk
menus state their selection count and preserve the existing review/confirmation
workflow. Explicit navigation is separate from editing a search result.

Arcade owns `web/ui-foundation.js` for dialog and submenu presentation lifecycle.
Its helpers contain no transport or collection policy. Dialogs enter and return
focus, contain Tab traversal, respect nested editors and defer dismissal while a
request is outstanding. Supported Stop controls remain usable. Settings keep
per-scope drafts and make unsaved sections/discard explicit.

Typography must combine shared interface scale with committed component font
choices. Virtual row dimensions must match rendered rows. High-contrast tokens
must take precedence over inline theme values and remain effective after later
theme updates. Primary button foregrounds must remain readable on bright accents.

## Portal-hosted Widget Layout

- The top-right settings/reload controls are an absolutely positioned action rail, not part of Widget content flow. Treat that rail as reserved space in board and sidebar layouts.
- A settings-only Widget must keep its title, status, timestamp, input, and other top-row content at least `26px` clear of the right edge. A Widget with reload plus settings controls must reserve at least `52px`.
- Prefer shared rules in `Widgets/core/widget-action-layout.css`; add a focused layout assertion whenever a new top-row pattern is introduced. Check long labels, timestamps, text scaling, and compact/sidebar widths rather than relying on short fixture content.

Portal gives board/sidebar Widgets a visible border using the current theme's `--border` and `--radius`, with a subtle panel surface. A nonempty configured `widget.title` appears in a shared host-owned heading above the body, clear of the action rail. Renderers must not repeat the configured title. Long names wrap within the card, and clearing the title removes that heading.

## Concise control surfaces

The approved Portal workspace uses compact spacing. Keep navigation, bookmark
lists, menus and dialogs compact without reducing control reachability or
overriding the user's text-scale and typography choices.

Do not add descriptive footers to cards, widgets, panels or dialogs. Put optional
explanations in tooltips on the relevant controls. Footers are for actions and
essential status only; errors and recovery guidance must remain visible when
the user needs to act.

Prefer self-explanatory labels and compact controls. Avoid routine explanatory paragraphs or success messages beneath cards; use tooltips for optional context and concise visible errors when action is required. Save simple settings as they change when the surface supports immediate edits. Keep explicit Done/Cancel for draft modals.

Nested Templates dialogs use an opaque `--panel` surface so the underlying settings do not show through. Their header uses the shared drag helper, with drag listeners bound to the dialog lifetime; open/resize recenters the dialog within the viewport.
