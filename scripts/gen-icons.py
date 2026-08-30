import zlib, struct, math

def dist_to_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

def in_rounded_rect(x, y, s, r):
    if x < r and y < r:
        return (x - r) ** 2 + (y - r) ** 2 <= r * r
    if x >= s - r and y < r:
        return (x - (s - r)) ** 2 + (y - r) ** 2 <= r * r
    if x < r and y >= s - r:
        return (x - r) ** 2 + (y - (s - r)) ** 2 <= r * r
    if x >= s - r and y >= s - r:
        return (x - (s - r)) ** 2 + (y - (s - r)) ** 2 <= r * r
    return True

def in_check(x, y, s):
    pts = [(0.28 * s, 0.54 * s), (0.45 * s, 0.70 * s), (0.74 * s, 0.34 * s)]
    w = 0.065 * s
    for i in range(len(pts) - 1):
        if dist_to_segment(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) <= w:
            return True
    return False

def make_png(size, path):
    rows = []
    r = size * 0.22
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            if in_rounded_rect(x, y, size, r):
                if in_check(x, y, size):
                    row += bytes([225, 245, 238, 255])
                else:
                    row += bytes([15, 110, 86, 255])
            else:
                row += bytes([0, 0, 0, 0])
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)

make_png(192, "public/pwa-192.png")
make_png(512, "public/pwa-512.png")
print("icons generated")
