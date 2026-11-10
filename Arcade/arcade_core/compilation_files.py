"""Bounded, read-only FAT12 directory listings for SuperGAU application images."""
import struct

SERIES = {'SuperGAU User Disk', 'SuperGAU Speak Disk', 'SuperGAU Utility Disk'}
MAX_IMAGE = 8 * 1024 * 1024


def disk_files(raw):
    """Return in-image names only. Never extract, execute, or infer software titles."""
    if not 512 <= len(raw) <= MAX_IMAGE:
        raise ValueError('Unsupported disk image size')
    sector, per_cluster, reserved, fats, roots, sectors, _, fat_sectors = struct.unpack_from('<HBHBHHBH', raw, 11)
    if (sector not in {512, 1024} or per_cluster not in {1, 2, 4, 8, 16} or
            not 1 <= reserved <= 32 or fats not in {1, 2} or not 1 <= roots <= 512 or
            not 1 <= fat_sectors <= 32 or not 0 < sectors * sector <= len(raw)):
        raise ValueError('Unsupported FAT12 geometry')
    root_start = (reserved + fats * fat_sectors) * sector
    data_start = root_start + ((roots * 32 + sector - 1) // sector) * sector
    cluster_size = sector * per_cluster
    clusters = (sectors * sector - data_start) // cluster_size
    fat = raw[reserved * sector:(reserved + fat_sectors) * sector]
    if not 1 <= clusters < 4085 or (clusters + 2) * 3 > len(fat) * 2:
        raise ValueError('Invalid FAT12 layout')
    visited, names = set(), []

    def directory(cluster):
        if not 2 <= cluster < clusters + 2:
            raise ValueError('Invalid directory cluster')
        chunks = []
        while cluster < 0xff8:
            if not 2 <= cluster < clusters + 2 or cluster in visited:
                raise ValueError('Invalid or cyclic directory chain')
            visited.add(cluster)
            offset = data_start + (cluster - 2) * cluster_size
            chunks.append(raw[offset:offset + cluster_size])
            fat_offset = cluster + cluster // 2
            value = int.from_bytes(fat[fat_offset:fat_offset + 2], 'little')
            cluster = (value >> 4 if cluster & 1 else value) & 0xfff
        return b''.join(chunks)

    def walk(data, prefix='', depth=0):
        if depth > 16:
            raise ValueError('Directory nesting exceeds the index limit')
        for offset in range(0, len(data), 32):
            entry = data[offset:offset + 32]
            if entry[0] == 0:
                break
            if entry[0] == 0xe5 or entry[11] & 8:  # Deleted, volume label or long-name slot.
                continue
            base, ext = entry[:8].rstrip(b' '), entry[8:11].rstrip(b' ')
            if base in (b'.', b'..'):
                continue
            name = (base + (b'.' + ext if ext else b'')).decode('cp437')
            if not base or any(c in name for c in '\\/:\x00') or any(ord(c) < 32 for c in name):
                raise ValueError('Invalid directory filename')
            path = prefix + name
            if len(path) > 240 or len(names) >= 8192:
                raise ValueError('Directory listing exceeds the index limit')
            folder = bool(entry[11] & 16)
            names.append({'title': path, 'kind': 'Folder' if folder else 'File', 'url': ''})
            if folder:
                walk(directory(int.from_bytes(entry[26:28], 'little')), path + '/', depth + 1)

    walk(raw[root_start:root_start + roots * 32])
    # Keep launchable files and top-level names visible when a large image needs
    # truncation. These are display paths, never host paths or launch targets.
    programs = {'PRG', 'APP', 'TOS', 'TTP', 'ACC', 'CPX'}
    names.sort(key=lambda item: (item['title'].rsplit('.', 1)[-1].upper() not in programs,
                                 item['title'].count('/'), item['title'].casefold()))
    return names
