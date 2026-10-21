"""Renders the app icons (a gold spade on a charcoal tile) with only the stdlib."""
import math
import struct
import zlib
from pathlib import Path

BG = (18, 18, 20)
TILE = (32, 32, 36)
FG = (198, 168, 107)
OUT = Path(__file__).resolve().parent.parent / "public"


def inside_spade(x: float, y: float) -> bool:
    """Spade in unit coords, x in [-1, 1], y in [-1, 1] (down is +)."""
    # two lobes
    for cx in (-0.32, 0.32):
        if (x - cx) ** 2 + (y - 0.12) ** 2 <= 0.36**2:
            return True
    # upper point: region above the lobes bounded by two lines
    if -0.75 <= y <= 0.15 and abs(x) <= (y + 0.75) * 0.75:
        return True
    # stem
    if 0.1 <= y <= 0.78 and abs(x) <= 0.06 + (y - 0.1) * 0.35:
        return True
    return False


def render(size: int) -> bytes:
    ss = 3  # supersampling
    rows = []
    r = size * 0.22
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            hits = tile = 0
            for sy in range(ss):
                for sx in range(ss):
                    x = px + (sx + 0.5) / ss
                    y = py + (sy + 0.5) / ss
                    # rounded tile with small margin
                    m = size * 0.04
                    dx = max(m + r - x, 0, x - (size - m - r))
                    dy = max(m + r - y, 0, y - (size - m - r))
                    if math.hypot(dx, dy) <= r:
                        tile += 1
                    ux = (x / size - 0.5) * 2 / 0.62
                    uy = (y / size - 0.5) * 2 / 0.62
                    if inside_spade(ux, uy):
                        hits += 1
            n = ss * ss
            base = [BG[i] + (TILE[i] - BG[i]) * tile / n for i in range(3)]
            px_rgb = [round(base[i] + (FG[i] - base[i]) * hits / n) for i in range(3)]
            row += bytes(px_rgb)
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
    (OUT / name).write_bytes(render(size))
    print("wrote", name)
