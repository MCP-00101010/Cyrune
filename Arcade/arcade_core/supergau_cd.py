"""Original SuperGAU CD descriptions and per-image contents evidence."""
from collections import Counter, defaultdict
import hashlib
import re
import zipfile

from arcade_core.paths import ConfinedRoot
from arcade_core.supergau_media import archive_image, crc16, fat_contents, lzh_headers

PROVIDER = 'SuperGAU Systems Archive-CD Volume 1'
SERIES = {'GAU': 'SuperGAU Compilation', 'USER': 'SuperGAU User Disk',
          'SPEAK': 'SuperGAU Speak Disk', 'UTIL': 'SuperGAU Utility Disk',
          'DEMO': 'SuperGAU Demo Disk', 'TAKE': 'SuperGAU Take Off Disk'}
PREFIXES = {value: key for key, value in SERIES.items()}
CODE = r'(?:GAU|USER|SPEAK|UTIL|DEMO|TAKE)_\d{2,3}'
ALIASES = {'GAU_267': 'SHAOLIN', 'GAU_368': 'SKIDROW1', 'GAU_369': 'SKIDROW2', 'GAU_428': 'SYNTAXTE'}


def code_for(prefix, number):
    return f'{prefix}_{number:02d}' if prefix == 'SPEAK' else f'{prefix}_{number:03d}'


def descriptions(raw):
    if len(raw) > 2 * 1024 * 1024:
        raise ValueError('CD description list is too large')
    records, current = {}, None
    for line in raw.decode('cp1252', errors='replace').splitlines():
        match = re.fullmatch(r'(' + CODE + r')[.:](?:LZH|ZIP)\s*(.*)', line, re.I)
        if match:
            current = match[1].upper()
            if current in records or len(records) >= 2000:
                raise ValueError('Duplicate or excessive CD descriptions')
            records[current] = [match[2].strip()] if match[2].strip() else []
        elif line[:1].isspace() and line.strip() and current:
            records[current].append(line.strip())
        elif line.strip():
            current = None
    if not records or any(not lines or len(lines) > 200 for lines in records.values()):
        raise ValueError('Invalid CD descriptions')
    return records


def read_source(root):
    root = ConfinedRoot(root)
    path = root.resolve('SS_AA_01.TXT', require_exists=True)
    raw = path.read_bytes()
    records = descriptions(raw)
    if not all(code in records for code in ('GAU_001', 'USER_001', 'SPEAK_01', 'UTIL_001')):
        raise ValueError('This is not the supported SuperGAU Volume 1 catalogue')
    source_hash = hashlib.sha256(raw).hexdigest()
    menus = {}
    for code, lines in records.items():
        prefix, number = code.split('_')
        contents, notes = [], []
        for line in lines:
            line = re.sub(r'[\x00-\x1f\x7f]', ' ', line).strip()
            if len(line) > 240:
                raise ValueError('CD description exceeds title bounds')
            if re.match(r'^(?:FCOPY\s*\(|ACOPY\s*\(|MSA\s+\d|\(\s*(?:LABEL|PASSWORD)\s*[=:])', line, re.I):
                notes.append(line)
                continue
            suffix = re.search(r'\s{2,}MSA\s+[\d.]+\s*$', line, re.I)
            if suffix:
                notes.append(line[suffix.start():].strip())
                line = line[:suffix.start()].strip()
            # The CD wraps sentences and parenthesized lists across lines.
            if contents and (line.startswith(('(', 'FUER ', 'RAMDISKS', 'NRCS UND ')) or
                             contents[-1]['title'].endswith(('DIVERSE', ',', 'FN-FUNKTIONEN'))):
                combined = contents[-1]['title'] + ' ' + line
                if len(combined) <= 240:
                    contents[-1]['title'] = combined
                    continue
            if line:
                contents.append({'title': line, 'kind': {'GAU':'Software', 'DEMO':'Demo', 'TAKE':'Clip art'}.get(prefix, 'Software'), 'url':''})
        menus[code] = {'disk_id':'sg:' + code, 'provider':PROVIDER, 'source_date':'1997-04-20',
            'source_file':'SS_AA_01.TXT', 'source_sha256':source_hash,
            'set':SERIES[prefix], 'number':int(number), 'part':'', 'version':'', 'hashes':[],
            'url':'', 'license':'', 'screenshots':[], 'contents':contents,
            'original_lines':lines, 'notes':notes, 'verification':'label'}
    # The repack's area list disagrees with the master on a part letter. Keep
    # both as source evidence; do not silently assign either letter.
    if 'GAU_701' in menus:
        menus['GAU_701']['notes'].append('Master list says Space Quest 3 part A; the area FILES.BBS says part D. Part designation needs review.')
    take = root.resolve('take_off/T_OFF_01.LST')
    if take.exists():
        categories, category = defaultdict(list), ''
        if take.stat().st_size > 2 * 1024 * 1024:
            raise ValueError('Take Off index is too large')
        for line in take.read_bytes().decode('cp437').splitlines():
            match = re.match(r'^\s+(\d{3})\s*-\s*(.+)', line)
            if match and category:
                categories[int(match[1])].append({'title': category, 'kind':'Clip art', 'subtype':'Images ' + match[2].strip()[:64], 'url':''})
            elif re.match(r'^ {4}\S', line) and not re.match(r'^\s*(?:Stand|Serie)\b', line):
                category = line.strip()[:160]
        for number, items in categories.items():
            code = code_for('TAKE', number)
            if code in menus:
                menus[code]['contents'] = items[:200]
                menus[code]['notes'].append('Clip-art subjects and image numbers from T_OFF_01.LST (19 December 1993).')
    return menus


def archives(root):
    confined = ConfinedRoot(root)
    result, names = {}, {}
    paths = list(root.rglob('*'))
    if len(paths) > 10000:
        raise ValueError('Too many files in CD source')
    for path in paths:
        if path.suffix.lower() not in {'.zip', '.lzh'} or not path.is_file():
            continue
        path = confined.resolve(path.relative_to(root).as_posix(), require_exists=True)
        name = path.stem.upper()
        if name in names:
            raise ValueError('Duplicate CD archive identity')
        names[name] = path
        if re.fullmatch(CODE, name):
            result[name] = path
    for code, name in ALIASES.items():
        if code not in result and name in names:
            result[code] = names[name]
    return result


class Evidence:
    def __init__(self, source_archives, seven_zip=None):
        self.archives, self.seven_zip = source_archives, seven_zip
        self.headers, self.images, self.crcs = {}, {}, {}
        for code, path in source_archives.items():
            if code.startswith(('USER_', 'SPEAK_', 'UTIL_')):
                try:
                    self.headers[code] = lzh_headers(path)
                except ValueError:
                    pass

    def image_hash(self, code):
        if code not in self.images:
            try:
                raw = archive_image(self.archives[code], self.seven_zip)
                self.images[code] = hashlib.sha512(raw).hexdigest()
            except (OSError, ValueError, KeyError, RuntimeError, zipfile.BadZipFile):
                self.images[code] = None
        return self.images[code]

    def compare(self, code, raw):
        if code.startswith(('GAU_', 'DEMO_')) or any(n.lower().endswith('.msa') for n, _, _ in self.headers.get(code, [])):
            return (code, 'image', '') if self.image_hash(code) == hashlib.sha512(raw).hexdigest() else (code, 'label', 'Image does not match an available validated CD disk; description is a numbered reference.')
        headers = self.headers.get(code)
        if not headers:
            return code, 'label', 'CD file checksums are unavailable for this image.'
        try:
            actual = fat_contents(raw)
            signatures = []
            core = []
            for name, content in actual.items():
                sha = hashlib.sha256(content).digest()
                if sha not in self.crcs:
                    self.crcs[sha] = crc16(content)
                signature = (len(content), self.crcs[sha])
                signatures.append(signature)
                if name.upper() != 'DESKTOP.INF':
                    core.append(signature)
            if Counter(signatures) == Counter((size, crc) for _, size, crc in headers):
                return code, 'contents', 'All file sizes and CRCs match the CD archive; filenames may differ.'
            candidates = [other for other, members in self.headers.items() if
                Counter(core) == Counter((size, crc) for name, size, crc in members if name.upper() != 'DESKTOP.INF')]
            if len(candidates) == 1 and candidates[0] != code:
                return candidates[0], 'contents', f'Filename identifies {code}; file contents match {candidates[0]} apart from desktop settings. Original image and launch identity retained.'
            return code, 'label', 'CD file inventory differs from this image. Software names are a numbered reference.'
        except ValueError:
            return code, 'label', 'This image has no supported readable file inventory; software names are a numbered reference.'
