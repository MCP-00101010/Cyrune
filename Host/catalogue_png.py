"""Bounded static PNG thumbnails using only the standard library.

PNG filtering/chunk rules: https://www.w3.org/TR/png-3/
Admits noninterlaced 8-bit grayscale/RGB/alpha and 1/2/4/8-bit palettes.
Other formats, animation and 16-bit/interlaced PNGs deliberately fall back.
"""

import struct
import zlib

SIGNATURE = b"\x89PNG\r\n\x1a\n"
MAX_INPUT = 4 * 1024 * 1024
MAX_PIXELS = 1024 * 1024
MAX_OUTPUT = 128 * 1024


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def _paeth(a, b, c):
    p = a + b - c
    distances = (abs(p - a), abs(p - b), abs(p - c))
    return (a, b, c)[distances.index(min(distances))]


def thumbnail(raw, *, check=lambda: None):
    """Fully decode the admitted subset and emit only newly encoded RGBA pixels."""
    if not isinstance(raw, bytes) or len(raw) > MAX_INPUT or not raw.startswith(SIGNATURE):
        raise ValueError("unavailable")
    offset, parts, palette, alpha, header = 8, [], None, None, None
    saw_data, ended_data, ended = False, False, False
    count = 0
    while offset < len(raw):
        check()
        count += 1
        if count > 4096 or offset + 12 > len(raw):
            raise ValueError("unavailable")
        size = struct.unpack_from(">I", raw, offset)[0]
        kind = raw[offset + 4:offset + 8]
        if offset + 12 + size > len(raw) or any(not (65 <= c <= 90 or 97 <= c <= 122) for c in kind) or kind[2] & 32:
            raise ValueError("unavailable")
        data = raw[offset + 8:offset + 8 + size]
        if zlib.crc32(kind + data) != struct.unpack_from(">I", raw, offset + 8 + size)[0]:
            raise ValueError("unavailable")
        offset += size + 12
        if header is None and kind != b"IHDR":
            raise ValueError("unavailable")
        if saw_data and kind != b"IDAT":
            ended_data = True
        if kind == b"IHDR":
            if header is not None or size != 13:
                raise ValueError("unavailable")
            header = struct.unpack(">IIBBBBB", data)
            width, height, depth, color, compression, filtering, interlace = header
            if (not 1 <= width <= 2048 or not 1 <= height <= 2048 or width * height > MAX_PIXELS
                    or color not in {0, 2, 3, 4, 6} or compression or filtering or interlace
                    or depth not in ({1, 2, 4, 8} if color == 3 else {8})):
                raise ValueError("unavailable")
        elif kind == b"PLTE":
            if palette is not None or saw_data or not size or size % 3 or size > 768 or color in {0, 4}:
                raise ValueError("unavailable")
            palette = [data[n:n + 3] for n in range(0, size, 3)]
            if color == 3 and len(palette) > 2**depth:
                raise ValueError("unavailable")
        elif kind == b"tRNS":
            if alpha is not None or saw_data or color not in {0, 2, 3}:
                raise ValueError("unavailable")
            if color == 3 and (palette is None or not 1 <= size <= len(palette)) or color == 0 and size != 2 or color == 2 and size != 6:
                raise ValueError("unavailable")
            alpha = data
        elif kind == b"IDAT":
            if ended_data or color == 3 and palette is None:
                raise ValueError("unavailable")
            saw_data = True
            parts.append(data)
        elif kind == b"IEND":
            if size or not saw_data or offset != len(raw):
                raise ValueError("unavailable")
            ended = True
            break
        elif kind in {b"acTL", b"fcTL", b"fdAT"} or not kind[0] & 32:
            raise ValueError("unavailable")
        # Bounded ancillary payloads are discarded without decompressing metadata.
    if not ended:
        raise ValueError("unavailable")
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color]
    stride = (width * channels * depth + 7) // 8
    bpp = max(1, (channels * depth + 7) // 8)
    decoder = zlib.decompressobj()
    decoded = decoder.decompress(b"".join(parts), (stride + 1) * height + 1)
    if len(decoded) != (stride + 1) * height or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
        raise ValueError("unavailable")
    pixels, prior = [], bytearray(stride)
    transparent = tuple(struct.unpack(">" + "H" * (len(alpha) // 2), alpha)) if alpha and color != 3 else None
    if transparent and any(sample > 255 for sample in transparent):
        raise ValueError("unavailable")
    for y in range(height):
        check()
        start = y * (stride + 1)
        filter_type = decoded[start]
        row = bytearray(decoded[start + 1:start + 1 + stride])
        if filter_type > 4:
            raise ValueError("unavailable")
        if filter_type:
            for i in range(stride):
                a, b, c = (row[i - bpp] if i >= bpp else 0), prior[i], (prior[i - bpp] if i >= bpp else 0)
                predictor = a if filter_type == 1 else b if filter_type == 2 else (a + b) // 2 if filter_type == 3 else _paeth(a, b, c)
                row[i] = (row[i] + predictor) & 255
        rgba = bytearray()
        for x in range(width):
            if color == 3:
                index = (row[x * depth // 8] >> (8 - depth - x * depth % 8)) & (2**depth - 1)
                if index >= len(palette):
                    raise ValueError("unavailable")
                rgba.extend(palette[index] + bytes([alpha[index] if alpha and index < len(alpha) else 255]))
            else:
                values = tuple(row[x * channels:(x + 1) * channels])
                rgb = values[:3] if color in {2, 6} else (values[0],) * 3
                opacity = values[-1] if color in {4, 6} else 0 if transparent == values else 255
                rgba.extend((*rgb, opacity))
        pixels.append(rgba)
        prior = row
    edge = 256
    while True:
        check()
        ratio = min(1, edge / max(width, height))
        out_width, out_height = max(1, int(width * ratio)), max(1, int(height * ratio))
        scanlines = bytearray()
        for y in range(out_height):
            scanlines.append(0)
            row = pixels[y * height // out_height]
            for x in range(out_width):
                start = (x * width // out_width) * 4
                scanlines.extend(row[start:start + 4])
        output = SIGNATURE + chunk(b"IHDR", struct.pack(">IIBBBBB", out_width, out_height, 8, 6, 0, 0, 0))
        output += chunk(b"IDAT", zlib.compress(bytes(scanlines))) + chunk(b"IEND", b"")
        if len(output) <= MAX_OUTPUT:
            return output, out_width, out_height
        edge //= 2
