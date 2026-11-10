"""Read CD archives and disk images without extracting or executing their files."""
import hashlib
from pathlib import PurePosixPath
import re
import struct
import subprocess
import zipfile

MAX_BYTES = 8 * 1024 * 1024
CRC_TABLE = []
for _value in range(256):
    for _bit in range(8):
        _value = (_value >> 1) ^ 0xa001 if _value & 1 else _value >> 1
    CRC_TABLE.append(_value)


def crc16(raw):
    value = 0
    for byte in raw:
        value = (value >> 8) ^ CRC_TABLE[(value ^ byte) & 255]
    return value


def decode_msa(raw):
    if not 10 <= len(raw) <= MAX_BYTES:
        raise ValueError('Invalid MSA size')
    magic, sectors, sides, first, last = struct.unpack_from('>5H', raw)
    if magic != 0xe0f or not 1 <= sectors <= 20 or sides > 1 or first != 0 or last > 85:
        raise ValueError('Unsupported MSA geometry')
    size, offset, output = sectors * 512, 10, bytearray()
    for _ in range((last + 1) * (sides + 1)):
        length = int.from_bytes(raw[offset:offset + 2], 'big')
        offset += 2
        track = raw[offset:offset + length]
        offset += length
        if not length or len(track) != length or length > size:
            raise ValueError('Invalid MSA track')
        if length == size:
            output.extend(track)
            continue
        decoded, index = bytearray(), 0
        while index < length:
            if track[index] != 0xe5:
                decoded.append(track[index])
                index += 1
            else:
                if index + 4 > length:
                    raise ValueError('Truncated MSA run')
                repeat = int.from_bytes(track[index + 2:index + 4], 'big')
                if not repeat or len(decoded) + repeat > size:
                    raise ValueError('Invalid MSA run')
                decoded.extend(bytes([track[index + 1]]) * repeat)
                index += 4
        if len(decoded) != size:
            raise ValueError('Invalid expanded MSA track')
        output.extend(decoded)
    if offset != len(raw):
        raise ValueError('Unexpected MSA trailing data')
    return bytes(output)


def lzh_headers(path):
    if path.stat().st_size > MAX_BYTES:
        raise ValueError('Archive is too large')
    raw, offset, result = path.read_bytes(), 0, []
    while offset < len(raw) and raw[offset]:
        header = raw[offset:offset + raw[offset] + 2]
        if len(header) < 24 or header[20] != 0 or sum(header[2:]) & 255 != header[1]:
            raise ValueError('Unsupported LZH header')
        packed, size = struct.unpack_from('<II', header, 7)
        length = header[21]
        if 24 + length > len(header) or size > MAX_BYTES or len(result) >= 8192:
            raise ValueError('Invalid LZH member')
        name = header[22:22 + length].decode('cp437').replace('\\', '/')
        result.append((name, size, int.from_bytes(header[22 + length:24 + length], 'little')))
        offset += len(header) + packed
        if offset > len(raw):
            raise ValueError('Truncated LZH archive')
    if sum(size for _, size, _ in result) > MAX_BYTES:
        raise ValueError('Expanded archive is too large')
    return result


def archive_files(path, seven_zip=None):
    if path.stat().st_size > MAX_BYTES:
        raise ValueError('Archive is too large')
    if path.suffix.lower() == '.zip':
        with zipfile.ZipFile(path) as archive:
            members = archive.infolist()
            if len(members) > 8192 or sum(i.file_size for i in members) > MAX_BYTES:
                raise ValueError('Expanded archive is too large')
            return [(i.filename.replace('\\', '/'), archive.read(i)) for i in members if not i.is_dir()]
    if path.suffix.lower() != '.lzh' or seven_zip is None or not seven_zip.is_file():
        raise ValueError('An installed 7-Zip executable is required for LZH files')
    result = []
    for name, size, crc in lzh_headers(path):
        # Stream one explicitly named member to memory; 7-Zip writes no files.
        if not name or name.startswith('-') or any(c in name for c in '*?\x00'):
            raise ValueError('Unsupported LZH member name')
        process = subprocess.run([str(seven_zip), 'e', '-so', '-spd', str(path), name.replace('/', '\\')],
                                 capture_output=True, timeout=40, check=False)
        if process.returncode or len(process.stdout) != size or crc16(process.stdout) != crc:
            raise ValueError('LZH member failed its size or checksum check')
        result.append((name, process.stdout))
    return result


def archive_image(path, seven_zip=None):
    files = archive_files(path, seven_zip)
    images = [(name, raw) for name, raw in files if name.lower().endswith(('.msa', '.st'))]
    if len(images) != 1:
        raise ValueError('Archive does not contain exactly one supported disk image')
    name, raw = images[0]
    if name.lower().endswith('.msa'):
        return decode_msa(raw)
    if not 512 <= len(raw) <= MAX_BYTES or len(raw) % 512:
        raise ValueError('Invalid ST image size')
    return raw


def fat_contents(raw):
    """Read bounded FAT12 files in memory, preserving exact in-image names."""
    if not 512 <= len(raw) <= MAX_BYTES:
        raise ValueError('Invalid disk image size')
    sector, cluster_sectors, reserved, fats, roots, sectors, _, fat_sectors = struct.unpack_from('<HBHBHHBH', raw, 11)
    if (sector != 512 or cluster_sectors not in {1, 2, 4, 8, 16} or not 1 <= reserved <= 32 or
            fats not in {1, 2} or not 1 <= roots <= 512 or not 1 <= fat_sectors <= 32 or
            not 0 < sectors * sector <= len(raw)):
        raise ValueError('Unsupported FAT12 geometry')
    start = (reserved + fats * fat_sectors) * sector
    data = start + ((roots * 32 + sector - 1) // sector) * sector
    unit = sector * cluster_sectors
    count = (sectors * sector - data) // unit
    fat = raw[reserved * sector:(reserved + fat_sectors) * sector]
    if not 1 <= count < 4085 or (count + 2) * 3 > len(fat) * 2:
        raise ValueError('Invalid FAT12 layout')
    directories, result, allocated = set(), {}, set()

    def chain(cluster):
        if not 2 <= cluster < count + 2:
            raise ValueError('Invalid initial cluster')
        chunks = []
        while cluster < 0xff8:
            if not 2 <= cluster < count + 2 or cluster in allocated:
                raise ValueError('Invalid or shared FAT12 chain')
            allocated.add(cluster)
            offset = data + (cluster - 2) * unit
            chunks.append(raw[offset:offset + unit])
            offset = cluster + cluster // 2
            value = int.from_bytes(fat[offset:offset + 2], 'little')
            cluster = (value >> 4 if cluster & 1 else value) & 0xfff
        return b''.join(chunks)

    def walk(block, prefix='', depth=0):
        if depth > 16:
            raise ValueError('Too many directory levels')
        for offset in range(0, len(block), 32):
            entry = block[offset:offset + 32]
            if entry[0] == 0:
                break
            if entry[0] == 229 or entry[11] & 8:
                continue
            base, ext = entry[:8].rstrip(b' '), entry[8:11].rstrip(b' ')
            if base in (b'.', b'..'):
                continue
            name = (base + (b'.' + ext if ext else b'')).decode('cp437')
            if not base or any(c in name for c in '\\/:\x00') or any(ord(c) < 32 for c in name):
                raise ValueError('Unsupported disk filename')
            name = prefix + name
            if len(name) > 240 or len(result) > 8192:
                raise ValueError('Directory exceeds bounds')
            cluster = int.from_bytes(entry[26:28], 'little')
            size = int.from_bytes(entry[28:32], 'little')
            if entry[11] & 16:
                if cluster in directories:
                    raise ValueError('Cyclic directory')
                directories.add(cluster)
                walk(chain(cluster), name + '/', depth + 1)
            else:
                if name in result or size > MAX_BYTES:
                    raise ValueError('Invalid file')
                content = chain(cluster)[:size] if size else b''
                if len(content) != size:
                    raise ValueError('Truncated disk file')
                result[name] = content
    walk(raw[start:start + roots * 32])
    return result


def reconstruct_clipart(files):
    """Create a nonbootable FAT12 disk containing the CD's loose 8.3 root files."""
    names, records = set(), []
    for name, raw in files:
        name = name.upper()
        if (not re.fullmatch(r'[A-Z0-9_!$~\-]{1,8}(?:\.[A-Z0-9_!$~\-]{1,3})?', name) or
                PurePosixPath(name).name != name or name in names or len(raw) > MAX_BYTES):
            raise ValueError('Clip-art archive needs filename review')
        names.add(name)
        records.append((name, raw))
    if not 1 <= len(records) <= 112:
        raise ValueError('Clip-art archive exceeds root-directory bounds')
    needed = sum((len(raw) + 1023) // 1024 for _, raw in records)
    sectors = next((n for n in (1440, 1760, 2880) if needed <= (n - 14) // 2), None)
    if sectors is None:
        raise ValueError('Clip-art files exceed a supported disk capacity')
    # High density needs a larger FAT. Re-evaluate usable clusters accordingly.
    fat_sectors = 5 if sectors == 2880 else 3
    root_sector = 1 + 2 * fat_sectors
    data_sector = root_sector + 7
    if needed > (sectors - data_sector) // 2:
        raise ValueError('Clip-art files exceed disk capacity')
    image = bytearray(sectors * 512)
    image[8:11] = hashlib.sha256(b''.join(raw for _, raw in records)).digest()[:3]
    struct.pack_into('<HBHBHHBH', image, 11, 512, 2, 1, 2, 112, sectors, 0xf9, fat_sectors)
    struct.pack_into('<HH', image, 24, sectors // 160, 2)
    fat = bytearray(fat_sectors * 512)
    fat[:3] = b'\xf9\xff\xff'

    def set_cluster(cluster, value):
        offset = cluster + cluster // 2
        previous = int.from_bytes(fat[offset:offset + 2], 'little')
        new = (previous & 15) | (value << 4) if cluster & 1 else (previous & 0xf000) | value
        fat[offset:offset + 2] = new.to_bytes(2, 'little')

    cluster = 2
    for index, (name, raw) in enumerate(records):
        offset = root_sector * 512 + index * 32
        base, _, ext = name.partition('.')
        image[offset:offset + 11] = (base.ljust(8) + ext.ljust(3)).encode('ascii')
        image[offset + 11] = 32
        blocks = (len(raw) + 1023) // 1024
        struct.pack_into('<HI', image, offset + 26, cluster if blocks else 0, len(raw))
        for block in range(blocks):
            set_cluster(cluster, 0xfff if block == blocks - 1 else cluster + 1)
            position = data_sector * 512 + (cluster - 2) * 1024
            content = raw[block * 1024:(block + 1) * 1024]
            image[position:position + len(content)] = content
            cluster += 1
    for offset in (512, (1 + fat_sectors) * 512):
        image[offset:offset + len(fat)] = fat
    # Atari boots executable sectors only when their big-endian sum is 0x1234.
    if sum(struct.unpack('>256H', image[:512])) & 0xffff == 0x1234:
        image[511] ^= 1
    if fat_contents(bytes(image)) != dict(records):
        raise ValueError('Reconstructed disk failed file-content verification')
    return bytes(image)
