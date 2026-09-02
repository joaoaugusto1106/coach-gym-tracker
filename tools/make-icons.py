#!/usr/bin/env python3
"""Generate Coach's app icons as PNGs — no dependencies, so they stay
reproducible on any machine.

    python3 tools/make-icons.py

Draws a solid dumbbell in the app's accent green on a near-black rounded
ground, supersampled 4x for smooth edges. iOS rounds apple-touch-icon itself,
so the square art is used for that; the maskable variant just pads the glyph
into the safe zone Android crops to.
"""

import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")

BG = (10, 12, 11)          # near-black, a touch green-biased
FG = (48, 209, 88)         # --accent in dark mode
SS = 4                     # supersample factor


def rounded_rect(px, py, cx, cy, hw, hh, r):
    """Point-in-rounded-rectangle test, all in normalised 0..1 coords."""
    dx = abs(px - cx)
    dy = abs(py - cy)
    if dx > hw or dy > hh:
        return False
    ix = hw - r
    iy = hh - r
    if dx <= ix or dy <= iy:
        return True
    return (dx - ix) ** 2 + (dy - iy) ** 2 <= r * r


def dumbbell(px, py, scale=1.0):
    """The glyph, centred on (0.5, 0.5) and scaled about that point."""
    px = 0.5 + (px - 0.5) / scale
    py = 0.5 + (py - 0.5) / scale
    cy = 0.5
    # handle
    if rounded_rect(px, py, 0.5, cy, 0.175, 0.048, 0.048):
        return True
    # inner plates
    for cx in (0.285, 0.715):
        if rounded_rect(px, py, cx, cy, 0.055, 0.215, 0.05):
            return True
    # outer plates
    for cx in (0.175, 0.825):
        if rounded_rect(px, py, cx, cy, 0.045, 0.135, 0.04):
            return True
    return False


def ground(px, py, radius):
    """The background plate. radius 0 gives a full-bleed square."""
    if radius <= 0:
        return True
    return rounded_rect(px, py, 0.5, 0.5, 0.5, 0.5, radius)


def render(size, glyph_scale=1.0, corner=0.0):
    """Return rows of RGB bytes."""
    n = size * SS
    rows = []
    # precompute one supersampled row of x positions
    xs = [(x + 0.5) / n for x in range(n)]
    for y in range(size):
        row = bytearray()
        # accumulate SS x SS samples per output pixel
        sub_rows = []
        for sy in range(SS):
            py = (y * SS + sy + 0.5) / n
            inside_bg = [ground(px, py, corner) for px in xs]
            inside_fg = [dumbbell(px, py, glyph_scale) for px in xs]
            sub_rows.append((inside_bg, inside_fg))
        for x in range(size):
            r = g = b = 0
            a_total = 0
            for inside_bg, inside_fg in sub_rows:
                for sx in range(SS):
                    i = x * SS + sx
                    if not inside_bg[i]:
                        continue
                    a_total += 1
                    c = FG if inside_fg[i] else BG
                    r += c[0]
                    g += c[1]
                    b += c[2]
            total = SS * SS
            if a_total == 0:
                # fully outside the rounded ground — use the background colour
                # rather than transparency, so the icon never shows through
                row += bytes(BG)
            else:
                # blend covered samples over BG for the uncovered ones
                r += BG[0] * (total - a_total)
                g += BG[1] * (total - a_total)
                b += BG[2] * (total - a_total)
                row += bytes((r // total, g // total, b // total))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("wrote %s (%d bytes)" % (os.path.relpath(path), len(png)))


def main():
    os.makedirs(OUT, exist_ok=True)
    # iOS rounds apple-touch-icon itself, so give it square art
    for size in (180, 192, 512):
        write_png(os.path.join(OUT, "icon-%d.png" % size), size, render(size))
    # Android maskable: same art, pulled into the 80% safe zone
    write_png(os.path.join(OUT, "icon-maskable-512.png"), 512, render(512, glyph_scale=0.72))
    # small favicon for browser tabs
    write_png(os.path.join(OUT, "favicon-64.png"), 64, render(64, corner=0.22))


if __name__ == "__main__":
    main()
