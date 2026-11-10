"""Preview/apply a downloaded catalogue export to the configured compilation source."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from arcade_core.atari import read_rows  # noqa: E402
from arcade_core.compilation_catalogue import CompilationCatalogue  # noqa: E402
from arcade_core.compilation_source import catalogue_from_export, secondary_catalogue, floppyshop_catalogue  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--arcade-config', type=Path, required=True)
    parser.add_argument('--export', type=Path)
    parser.add_argument('--date')
    parser.add_argument('--secondary', type=Path)
    parser.add_argument('--floppyshop-pages', type=Path, help='Folder containing page-N.html snapshots')
    parser.add_argument('--local-only', action='store_true')
    parser.add_argument('--collection', default='atari-st-compilations')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--include-labels', action='store_true')
    parser.add_argument('--include-files', action='store_true')
    args = parser.parse_args()
    if not args.local_only and not (args.export and args.date):
        parser.error('--export and --date are required unless --local-only is selected')
    if args.local_only and (args.export or args.secondary or args.floppyshop_pages):
        parser.error('--local-only cannot be combined with downloaded source files')
    config = json.loads(args.arcade_config.read_text(encoding='utf-8'))
    collection = next(c for c in config['collections'] if c['id'] == args.collection)
    store = CompilationCatalogue(args.arcade_config.resolve().parent, collection)
    catalogue = None if args.local_only else catalogue_from_export(args.export.read_bytes(), args.date)
    if args.secondary:
        catalogue['disks'].extend(secondary_catalogue(args.secondary.read_bytes()))
    if args.floppyshop_pages:
        first, pages = floppyshop_catalogue((args.floppyshop_pages / 'page-1.html').read_bytes())
        disks = first
        for page in range(2, pages + 1):
            disks.extend(floppyshop_catalogue((args.floppyshop_pages / f'page-{page}.html').read_bytes(), page)[0])
        if len({d['disk_id'] for d in disks}) != len(disks):
            raise ValueError('Floppyshop pages contain duplicate disks')
        catalogue['disks'].extend(disks)
    rows = read_rows(store.root)
    preview = store.prepare(rows, lambda: False, catalogue=catalogue, local_only=args.local_only)
    print(json.dumps({key: value for key, value in preview.items() if key not in {'token', 'rows'}}, indent=2))
    if args.apply:
        print(json.dumps(store.apply(rows, preview['token'], args.include_labels, args.include_files), indent=2))


if __name__ == '__main__':
    main()
