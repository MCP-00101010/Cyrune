"""Discover or review a native import manifest without applying any changes.

From the repository root:
  python -B Arcade/tools/inspect_import.py --spectrum-source SOURCE_ID --root COLLECTION
  python -B Arcade/tools/inspect_import.py --manifest FILE --root COLLECTION
  python -B Arcade/tools/inspect_import.py --scummvm-source SOURCE_ID --root COLLECTION --scummvm-config INI

--emit-manifest prints the native draft instead of a reference-check report.
It contains private relative filenames and is not a Portal export.
--check-launcher EXE checks ScummVM's exact configured targets without execution.
"""

import argparse
import json
from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from arcade_core.catalogue_identity import CatalogueError  # noqa: E402
from arcade_core.import_manifest import read_manifest, review_manifest  # noqa: E402
from arcade_core.import_spectrum import spectrum_manifest  # noqa: E402
from arcade_core.import_scummvm import scummvm_manifest, launch_preflight  # noqa: E402
from arcade_core.paths import PathConfinementError  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--spectrum-source", metavar="SOURCE_ID", help="Existing configured collection identity")
    source.add_argument("--scummvm-source", metavar="SOURCE_ID", help="Read existing ScummVM registrations")
    source.add_argument("--manifest", type=Path, help="Read a previously produced native manifest")
    parser.add_argument("--root", required=True, type=Path, help="Explicit local source root")
    parser.add_argument("--emit-manifest", action="store_true", help="Print the native draft, without file checks")
    parser.add_argument("--scummvm-config", type=Path, help="Existing native ScummVM INI file")
    parser.add_argument("--check-launcher", type=Path, help="Non-launching preflight of ScummVM targets and executable")
    args = parser.parse_args()
    if (bool(args.scummvm_source) != bool(args.scummvm_config)
            or args.check_launcher and (not args.scummvm_source or args.emit_manifest)):
        parser.error("Use --scummvm-source with --scummvm-config; --check-launcher requires ScummVM review mode")
    try:
        manifest = (scummvm_manifest(args.scummvm_source, args.root, args.scummvm_config) if args.scummvm_source else
                    read_manifest(args.manifest) if args.manifest else
                    spectrum_manifest(args.spectrum_source, args.root))
        result = manifest if args.emit_manifest else review_manifest(manifest, args.root)
        if args.check_launcher:
            for entry, report in zip(manifest["entries"], result["entries"], strict=True):
                try:
                    launch_preflight(args.root, args.scummvm_config, args.check_launcher, entry["target"])
                except CatalogueError as exc:
                    report["issues"].append({"field": "launch", "code": exc.code})
        print(json.dumps(result, ensure_ascii=True, indent=2))
        return 0 if args.emit_manifest or not any(entry["issues"] for entry in result["entries"]) else 2
    except (CatalogueError, OSError, PathConfinementError) as exc:
        print(json.dumps({"ok": False, "code": exc.code if isinstance(exc, CatalogueError) else "source-unavailable"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
