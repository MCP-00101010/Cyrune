"""Read Atari Legend's licensed export as data; never execute downloaded SQL."""
from collections import defaultdict
import gzip
import io
import re
from html.parser import HTMLParser
from urllib.request import HTTPRedirectHandler, Request, build_opener

ORIGIN = 'https://www.atarilegend.com'
EXPORTS = ORIGIN + '/data/database-dumps/'
LICENSE = 'https://creativecommons.org/licenses/by-nc-sa/4.0/'
SECONDARY = 'https://atari.8bitchip.info/MenuDG.html'
FLOPPYSHOP = 'https://www.atariuptodate.de/en/atari-pd-serie/floppyshop-utility'
TABLES = {'menu_sets', 'menus', 'menu_disks', 'menu_disk_contents', 'menu_disk_dumps',
          'menu_disk_screenshots', 'menu_software', 'menu_software_content_types',
          'games', 'game_releases'}
MAX_SQL = 64 * 1024 * 1024


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('The catalogue source redirected; try again later')


def fetch(url, limit, allowed):
    if not allowed():
        raise ValueError('Optional network access is disabled in Cyrune settings')
    if (url != SECONDARY and not re.fullmatch(re.escape(EXPORTS) + r'(?:\d{4}-\d{2}-\d{2}\.sql\.gz)?', url)
            and not re.fullmatch(re.escape(FLOPPYSHOP) + r'\?page=(?:[1-9]|[1-4][0-9]|50)', url)):
        raise ValueError('Unsupported catalogue URL')
    request = Request(url, headers={'User-Agent': 'CyruneArcade compilation catalogue'})
    with build_opener(NoRedirect()).open(request, timeout=40) as response:
        data = response.read(limit + 1)
    if not data or len(data) > limit:
        raise ValueError('Catalogue download exceeds its size limit or is empty')
    return data


def download(allowed):
    listing = fetch(EXPORTS, 256 * 1024, allowed).decode('utf-8')
    dates = re.findall(r'href="(\d{4}-\d{2}-\d{2})\.sql\.gz"', listing)
    if not dates:
        raise ValueError('No supported Atari Legend export is available')
    date = max(dates)
    return fetch(EXPORTS + date + '.sql.gz', 16 * 1024 * 1024, allowed), date


def sql_values(text):
    """A deliberately small lexer for literal MySQL INSERT tuples, not SQL."""
    token = re.compile(r"\s*(NULL|-?\d+|'(?:[^'\\]|\\.|'')*'|[(),;])", re.S)
    offset, row, expect = 0, None, 'row'
    while offset < len(text):
        match = token.match(text, offset)
        if not match:
            if text[offset:].strip():
                raise ValueError('Unsupported SQL literal in catalogue export')
            break
        value = match[1]
        offset = match.end()
        if expect == 'row' and value == '(':
            row, expect = [], 'value'
        elif expect == 'value' and (value == 'NULL' or value.startswith("'") or re.fullmatch(r'-?\d+', value)):
            if value == 'NULL':
                value = None
            elif value.startswith("'"):
                value = re.sub(r"\\(.)|''", lambda m: {'n':'\n', 'r':'\r', 't':'\t', '0':'\0', 'Z':'\x1a'}.get(m[1], m[1]) if m[1] else "'", value[1:-1])
            else:
                value = int(value)
            row.append(value)
            expect = 'delimiter'
        elif expect == 'delimiter' and value == ',':
            expect = 'value'
        elif expect == 'delimiter' and value == ')':
            yield row
            expect = 'next'
        elif expect == 'next' and value == ',':
            expect = 'row'
        elif expect == 'next' and value == ';' and not text[offset:].strip():
            return
        else:
            raise ValueError('Malformed catalogue values')
    raise ValueError('Incomplete catalogue INSERT')


def tables_from_export(compressed):
    if len(compressed) > 16 * 1024 * 1024:
        raise ValueError('Catalogue archive is too large')
    with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as stream:
        raw = stream.read(MAX_SQL + 1)
    if len(raw) > MAX_SQL:
        raise ValueError('Expanded catalogue is too large')
    sql = raw.decode('utf-8')
    tables = {}
    for table in TABLES:
        create = re.search(r'CREATE TABLE `' + table + r'` \((.*?)\) ENGINE=', sql, re.S)
        if not create:
            raise ValueError('Atari Legend export schema has changed: ' + table)
        columns = re.findall(r'^  `([^`]+)`', create[1], re.M)
        rows = {}
        # Dump statements end at a line-ending semicolon. Embedded strings use
        # escaped newlines; the lexer independently validates every literal.
        for insert in re.finditer(r'INSERT INTO `' + table + r'` VALUES\s*(.*?;)[\r\n]', sql, re.S):
            for values in sql_values(insert[1]):
                if len(values) != len(columns):
                    raise ValueError('Catalogue columns do not match their values')
                row = dict(zip(columns, values))
                if not isinstance(row.get('id'), int) or row['id'] in rows or len(rows) >= 100000:
                    raise ValueError('Invalid or excessive catalogue records')
                rows[row['id']] = row
        tables[table] = rows
    if not tables['menus'] or not tables['menu_disk_contents']:
        raise ValueError('The export contains no menu catalogue')
    return tables


def clean(value, limit=240):
    return re.sub(r'[\x00-\x1f\x7f]', ' ', str(value or '')).strip()[:limit]


def catalogue_from_export(compressed, date):
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
        raise ValueError('Invalid catalogue export date')
    tables = tables_from_export(compressed)
    sets, menus, games = (tables[key] for key in ('menu_sets', 'menus', 'games'))
    contents, hashes, screenshots = defaultdict(list), defaultdict(list), defaultdict(list)
    for content in tables['menu_disk_contents'].values():
        release = tables['game_releases'].get(content['game_release_id'], {})
        game = games.get(content['game_id'] or release.get('game_id'), {})
        software = tables['menu_software'].get(content['menu_software_id'], {})
        kind = tables['menu_software_content_types'].get(software.get('menu_software_content_type_id'), {}).get('name', 'Game')
        name = game.get('name') or software.get('name')
        if not name:
            continue
        contents[content['menu_disk_id']].append({
            'title': clean(name), 'kind': clean(kind, 64), 'position': int(content['position']),
            'subtype': clean(content['subtype'], 64), 'version': clean(content['version'], 64),
            'requirements': clean(content['requirements'], 64),
            'url': ORIGIN + '/games/' + str(game['id']) if game else '',
        })
    for dump in tables['menu_disk_dumps'].values():
        if re.fullmatch(r'[0-9a-fA-F]{128}', dump.get('sha512') or ''):
            hashes[dump['menu_disk_id']].append(dump['sha512'].lower())
    for shot in tables['menu_disk_screenshots'].values():
        if shot['imgext'] in {'png', 'jpg', 'jpeg', 'bmp'}:
            screenshots[shot['menu_disk_id']].append(ORIGIN + '/storage/images/menu_screenshots/' + str(shot['id']) + '.' + shot['imgext'])
    disks, by_set = [], defaultdict(list)
    for disk in tables['menu_disks'].values():
        menu = menus[disk['menu_id']]
        menuset = sets[menu['menu_set_id']]
        row = {'disk_id': 'al:' + str(disk['id']), 'provider': 'Atari Legend', 'source_date': date, 'license': LICENSE,
               'set_id': menuset['id'], 'set': clean(menuset['name']),
               'number': menu['number'], 'issue': clean(menu['issue'], 16),
               'version': clean(menu['version'], 16), 'part': clean(disk['part'], 32),
               'date': clean(menu['date'], 10), 'hashes': hashes[disk['id']],
               'contents': sorted(contents[disk['id']], key=lambda c: c['position'])[:200],
               'screenshots': screenshots[disk['id']][:2]}
        disks.append(row)
        by_set[menuset['id']].append(row)
    for set_id, rows in by_set.items():
        # Mirror Atari Legend's menu-set pagination, including descending sets.
        rows.sort(key=lambda row: (row['version'], row['part'].casefold()))
        rows.sort(key=lambda row: (row['number'] if row['number'] is not None else -1, row['issue'].casefold()),
                  reverse=sets[set_id]['sort_direction'] == 'desc')
        for index, row in enumerate(rows):
            row['url'] = f'{ORIGIN}/menusets/{set_id}?page={index // 20 + 1}#menudisk-{row["disk_id"].split(":")[1]}'
    return {'date': date, 'url': EXPORTS + date + '.sql.gz', 'license': LICENSE, 'disks': disks}


class MenuTable(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows, self.row, self.cell = [], None, None

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.row = []
        elif tag in {'td', 'th'} and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in {'td', 'th'} and self.cell is not None:
            self.row.append(' '.join(''.join(self.cell).split()))
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            self.rows.append(self.row)
            self.row = None


def secondary_catalogue(raw):
    if len(raw) > 4 * 1024 * 1024:
        raise ValueError('Secondary catalogue is too large')
    parser = MenuTable()
    parser.feed(raw.decode('utf-8', errors='replace'))
    disks, title, classification = {}, '', ''
    for cells in parser.rows:
        if len(cells) != 5 or not re.fullmatch(r'[A-Z]{2}\d{1,4}[A-Z]?', cells[3]):
            continue
        name, requirements, sequence, code, category = cells
        if name:
            title, classification = name, category
        elif category:
            classification = category
        if not title:
            raise ValueError('Secondary catalogue title continuation is invalid')
        match = re.fullmatch(r'([A-Z]{2})(\d+)([A-Z]?)', code)
        row = disks.setdefault(code, {'disk_id': '8b:' + code, 'provider': '8bitchip / Bruno',
            'source_date': '2004-08-31', 'license': '', 'set': match[1], 'number': int(match[2]),
            'issue': '', 'version': '', 'part': match[3], 'date': '', 'hashes': [], 'screenshots': [],
            'url': SECONDARY, 'contents': []})
        kind = ('Documentation' if classification.startswith('DOC') else 'Utility' if classification.startswith('Application')
                else 'Demo' if classification.startswith('Demo') else 'Software')
        row['contents'].append({'title': clean(title), 'kind': kind, 'position': len(row['contents']) + 1,
            'subtype': clean(classification, 64), 'version': '', 'requirements': clean(requirements, 64),
            'sequence': clean(sequence, 16), 'url': ''})
        if len(row['contents']) > 200 or len(disks) > 20000:
            raise ValueError('Secondary catalogue exceeds record limits')
    if not disks:
        raise ValueError('The secondary catalogue format has changed')
    return list(disks.values())


class FloppyshopPage(HTMLParser):
    """Read utility card headings and title lists; omit descriptions and downloads."""
    def __init__(self, page):
        super().__init__(convert_charrefs=True)
        self.page, self.disks, self.pages = page, {}, {1}
        self.current, self.in_list, self.title, self.description = None, False, None, False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a':
            match = re.fullmatch(re.escape(FLOPPYSHOP) + r'\?page=(\d{1,2})', attrs.get('href', ''))
            if match:
                number = int(match[1])
                if not 1 <= number <= 50:
                    raise ValueError('Floppyshop pagination exceeds its limit')
                self.pages.add(number)
        if tag == 'ul':
            self.in_list = self.current is not None and 'list-disc' in attrs.get('class', '').split()
        if tag == 'li' and self.in_list:
            self.title, self.description = [], False
        if tag == 'br' and self.title is not None:
            self.description = True

    def handle_data(self, data):
        match = re.fullmatch(r'\s*Floppyshop Utility (\d{4})\s*', data)
        if match and self.title is None:
            number = int(match[1])
            if number in self.disks:
                raise ValueError('Duplicate Floppyshop disk heading')
            self.current = {'disk_id': f'fs:{number:04d}', 'provider': 'AtariUpToDate',
                'source_date': '', 'license': '', 'set': 'Floppyshop Utility', 'number': number,
                'part': '', 'version': '', 'hashes': [], 'screenshots': [], 'contents': [],
                'url': FLOPPYSHOP + f'?page={self.page}'}
            self.disks[number] = self.current
        elif self.title is not None and not self.description:
            self.title.append(data)

    def handle_endtag(self, tag):
        if tag == 'li' and self.title is not None:
            title = clean(' '.join(''.join(self.title).split()))
            if title:
                self.current['contents'].append({'title': title, 'kind': 'Utility', 'url': ''})
            if len(self.current['contents']) > 200:
                raise ValueError('Floppyshop disk exceeds its contents limit')
            self.title = None
        if tag == 'ul':
            self.in_list = False


def floppyshop_catalogue(raw, page=1):
    if not 1 <= page <= 50 or len(raw) > 2 * 1024 * 1024:
        raise ValueError('Floppyshop page exceeds its limit')
    parser = FloppyshopPage(page)
    parser.feed(raw.decode('utf-8'))
    disks = [d for d in parser.disks.values() if d['contents']]
    if not disks or parser.title is not None:
        raise ValueError('The Floppyshop catalogue format has changed')
    return disks, max(parser.pages)


def download_floppyshop(allowed, progress=lambda *args: None):
    disks, pages = floppyshop_catalogue(fetch(FLOPPYSHOP + '?page=1', 2 * 1024 * 1024, allowed))
    for page in range(2, pages + 1):
        progress('download', page - 1, pages, f'Reading Floppyshop utility catalogue page {page} of {pages}')
        rows, _ = floppyshop_catalogue(fetch(FLOPPYSHOP + f'?page={page}', 2 * 1024 * 1024, allowed), page)
        disks.extend(rows)
    if len({d['disk_id'] for d in disks}) != len(disks):
        raise ValueError('Floppyshop pages overlap; retry the catalogue update')
    return disks
