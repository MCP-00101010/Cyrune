"""Independent PNG fixtures for the bounded native thumbnail boundary."""

import importlib.util
import os
from pathlib import Path
import struct
import zlib

import pytest

spec = importlib.util.spec_from_file_location("catalogue_png_test", Path(__file__).resolve().parents[1] / "catalogue_png.py")
PNG = importlib.util.module_from_spec(spec)
spec.loader.exec_module(PNG)


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def fixture(*, width=2, height=1, color=2, depth=8, scanlines=b"\0\x0a\x14\x1e\x28\x32\x3c", extra=b"", interlace=0):
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, depth, color, 0, 0, interlace))
            + extra + chunk(b"IDAT", zlib.compress(scanlines)) + chunk(b"IEND", b""))


def decoded(png):
    length = struct.unpack_from(">I", png, 33)[0]
    return zlib.decompress(png[41:41 + length])


@pytest.mark.parametrize("filter_type,first,second", [
    (0, [10, 20, 30, 40, 50, 60], [11, 22, 33, 44, 55, 66]),
    (1, [10, 20, 30, 30, 30, 30], [11, 22, 33, 33, 33, 33]),
    (2, [10, 20, 30, 40, 50, 60], [1, 2, 3, 4, 5, 6]),
    (3, [10, 20, 30, 35, 40, 45], [6, 12, 18, 19, 19, 20]),
    (4, [10, 20, 30, 30, 30, 30], [1, 2, 3, 4, 5, 6]),
])
def test_all_png_filters_reconstruct_pixels_and_discard_metadata(filter_type, first, second):
    source = fixture(height=2, scanlines=bytes([filter_type, *first, filter_type, *second]), extra=chunk(b"tEXt", b"private\0C:/device/path"))
    output, width, height = PNG.thumbnail(source)
    assert (width, height) == (2, 2)
    assert decoded(output) == bytes([0, 10, 20, 30, 255, 40, 50, 60, 255, 0, 11, 22, 33, 255, 44, 55, 66, 255])
    assert b"private" not in output and b"tEXt" not in output


@pytest.mark.parametrize("depth,packed", [(1, 0b01000000), (2, 0b00010000), (4, 0x01), (8, None)])
def test_indexed_spectrum_png_transparency(depth, packed):
    extra = chunk(b"PLTE", bytes([255, 0, 0, 0, 0, 255])) + chunk(b"tRNS", bytes([0, 128]))
    source = fixture(color=3, depth=depth, scanlines=bytes([0, packed]) if packed is not None else bytes([0, 0, 1]), extra=extra)
    assert decoded(PNG.thumbnail(source)[0]) == bytes([0, 255, 0, 0, 0, 0, 0, 255, 128])


@pytest.mark.parametrize("color,pixels,expected", [(0, [10, 20], [10, 10, 10, 255, 20, 20, 20, 255]),
    (4, [10, 128, 20, 64], [10, 10, 10, 128, 20, 20, 20, 64]),
    (6, [1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8])])
def test_grayscale_and_alpha_pixels(color, pixels, expected):
    assert decoded(PNG.thumbnail(fixture(color=color, scanlines=bytes([0, *pixels])))[0]) == bytes([0, *expected])


@pytest.mark.parametrize("source", [
    b"not an image", fixture()[:-1], fixture() + b"trailing", fixture(interlace=1), fixture(depth=16),
    fixture(width=2049), fixture(width=2048, height=2048), fixture(scanlines=b"\5" + b"\0" * 6),
    fixture(scanlines=b"\0" * 1000000), fixture(extra=chunk(b"acTL", b"\0" * 8)),
    fixture(extra=chunk(b"ABCD", b"")), fixture(extra=chunk(b"IHDR", b"\0" * 13)),
    fixture(color=3, depth=1, scanlines=b"\0\x80", extra=chunk(b"PLTE", b"\0\0\0")),
    fixture()[:25] + b"\xff" + fixture()[26:],
])
def test_invalid_unsupported_or_oversized_png_is_rejected(source):
    with pytest.raises((ValueError, zlib.error)):
        PNG.thumbnail(source)


def test_resize_byte_ceiling_and_cancellation():
    source = fixture(width=512, height=256, color=6, scanlines=b"".join(b"\0" + os.urandom(512 * 4) for _ in range(256)))
    output, width, height = PNG.thumbnail(source)
    assert width <= 256 and height <= 256 and width == height * 2
    assert len(output) <= 128 * 1024
    assert len(decoded(output)) == (width * 4 + 1) * height
    def cancelled():
        raise TimeoutError("timeout")
    with pytest.raises(TimeoutError):
        PNG.thumbnail(source, check=cancelled)
