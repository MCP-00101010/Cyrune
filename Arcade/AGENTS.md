# Cyrune Arcade Instructions

These instructions augment the repository-root `AGENTS.md` for all files under `Arcade/`.

## Required Context

Before acting on Arcade code, read `Arcade/README.md`, `Arcade/HEALTH-AUDIT.md`, `docs/architecture/component-boundaries.md`, and `docs/architecture/portal-arcade-contract.md`. Read `Relay/AGENTS.md` and `Host/AGENTS.md` before changing the authenticated transport or native service boundary.

## Product and Transport Boundaries

- Arcade owns collections, metadata, artwork, scrapers, incoming/review/trash flows, emulator definitions, profiles, launch decisions, favourites, and recent games.
- Keep `web/index.html`, `web/app.js`, and `web/styles.css` as the canonical external `file://` frontend. Do not copy, vendor, build, or embed the frontend into Relay or Portal.
- Keep business logic transport-independent under `emugui_core`/`emugui_service.py`. Relay may route authenticated bounded requests; Host may provide platform authority; neither owns Arcade business logic.
- Preserve compatibility-sensitive `EMUGUI_*` operation names, environment variables, meta identifiers, stable game/library/profile IDs, and persisted shapes unless a documented migration changes them.

## Filesystem, Metadata, and Launch Safety

- Confine every relative game, artwork, profile, import, and collection path to its approved root after real-path resolution; reject traversal and symlink escapes.
- Use atomic replacement and validated persisted shapes for state, configuration, collection metadata, and managed profiles. Multi-file mutations must be recoverable or explicitly staged before destructive application.
- Treat web search and scraper results as untrusted previews. Use validated HTTPS origins, bounded payloads, and an explicit preview/apply workflow.
- Launch with validated executable/helper paths and argument arrays, never shell command strings. Keep emulator paths, working directories, templates, and environment authority out of portable Portal data.
- Preserve TOSEC casing and tag semantics documented in `Arcade-TODO.md` when changing metadata parsing or rename workflows.

## Portal Integration

- Send only compact presentation data and an opaque device-local `gameKey` to Portal. Public source IDs may assist explicit rebind but never grant launch authority.
- Portal sessions must not receive Arcade collection mutation, rename, delete, scrape, import, profile-management, or arbitrary filesystem capabilities.
- Retain bounded job histories, request/response sizes, artwork limits, delivery-ID deduplication, and clear missing/changed binding states.

## Validation

Run `python -m pytest -q` from `Arcade/`. Use `python -B tools\validate_zx_launch.py` for relevant non-launching collection/profile checks. Never run the live emulator matrix without explicit user authorization and the documented closed-emulator preconditions. Run the root coordinated validator for Relay, Host, Portal delivery, binding, or shared-contract changes.
