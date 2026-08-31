# Cyrune Icon Family

The Cyrune icon family uses the three interlocking rounded-square loops from the original Nexus brand mark as a shared **Cyrune lattice**. Each component keeps that silhouette while turning one part of it into an object associated with its role.

## Icons

| Asset | Motif | Accent |
| --- | --- | --- |
| `icons/cyrune.svg` | Intact lattice; master project mark | Violet, blue, pink |
| `icons/portal.svg` | Partially open sliding doorway | `#a990ff` |
| `icons/widgets.svg` | Modular tiles | `#56d6e8` |
| `icons/arcade.svg` | Retro joystick | `#ffae68` |
| `icons/relay.svg` | RJ45-style data cable | `#6ba9ff` |
| `icons/host.svg` | Native server | `#55db9c` |
| `icons/nexus.svg` | Central junction | `#e870bd` |

Open `preview.html` locally to compare the complete family at 128, 32, 24, and 16 pixels.

## Usage

- Treat the SVG files as editable source masters.
- Preserve the `viewBox="0 0 128 128"` coordinate system when exporting.
- Prefer SVG at 24 pixels and above. For platform packages, export dedicated 16, 32, 48, 64, 128, 256, and 512 pixel PNGs from the masters.
- Keep the component object and accent paired; the lattice alone is reserved for the overall Cyrune project.
- Do not add text or another enclosing badge inside the icon artwork.
- Keep the accessible `<title>` and `<desc>` elements when embedding an icon directly in HTML.

The icons are original Cyrune project assets and inherit the repository's licensing terms.

Runtime pages use component-local copies of these masters so Portal, Arcade, Nexus, Relay, and the Widgets SDK fixture remain self-contained. Update the master first, then refresh the affected runtime copies together with their focused tests and release metadata.
