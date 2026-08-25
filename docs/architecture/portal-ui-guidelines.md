# Portal UI Guidelines

These are durable rules for Portal-owned modals and Portal-hosted Widget settings. Outstanding rollout work belongs in the owning component TODO; completed surfaces should continue following these rules.

## Content Modals

- Use the sidebar-card panel tint/opacity while retaining modal radius, border, and shadow.
- Keep inner sections flat and compact: use transparent surfaces, subtle borders, reduced horizontal padding, and close vertical spacing.
- Align content to the true text rail rather than icon or checkbox gutters.
- Centre top-level section labels with the established uppercase muted-label style.
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

- Build settings and create/edit previews from a complete draft. Cancel restores the original object and local view; only the explicit Done or Save action may commit and persist.
- Keep focus order, Escape/Cancel behaviour, keyboard activation, labels, and control hit areas accessible when restyling an established surface.
- Reuse existing modal primitives and shared controls before adding component-specific variants.
