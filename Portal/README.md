# Cyrune Portal

Cyrune Portal is the local dashboard, bookmark organiser, launcher surface, Inbox, search interface, and widget host formerly developed as Morpheus WebHub.

Open `index.html` directly through a browser with local-file access enabled for Cyrune Relay. Relative scripts, styles, themes, assets, and vendor libraries remain self-contained beneath this directory.

## Platform Limits

- Firefox/Zen may require explicit local-file permission for Relay.
- Windows Explorer drag payloads do not reveal trustworthy absolute paths for executable or binary shortcut files; use the Host-backed application picker. Readable `.url` files and allowlisted launcher URIs can be accepted directly.
- External bookmark drags do not expose item-specific data until drop, and dragging a browser bookmark folder exposes only one URL. Full-folder import requires Relay interception.
