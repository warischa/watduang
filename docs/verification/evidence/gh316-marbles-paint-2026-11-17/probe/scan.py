# Marble-race pixel scan. usage: python3 -I scan.py <png> <rect-x> <rect-y> <rect-w> <rect-h> [inject]
# Maps the 1920x1080 board frame into the canvas rect (camera fits the whole frame, centred) and counts
# colour families inside the lane band, plus the controls (finish line, plates, band).
import sys, colorsys, json
from PIL import Image, ImageDraw

png, rx, ry, rw, rh = sys.argv[1], *map(float, sys.argv[2:6])
inject = len(sys.argv) > 6 and sys.argv[6] == 'inject'
im = Image.open(png).convert('RGB')
s = min(rw / 1920, rh / 1080)
ox = rx + (rw - 1920 * s) / 2
oy = ry + (rh - 1080 * s) / 2
def S(fx, fy):
    return (ox + fx * s, oy + fy * s)
if inject:
    # Calibration: a lit pink disc (board marble radius 13) in lane 1 mid-track.
    d = ImageDraw.Draw(im)
    cx, cy = S(1000, 140 + 16)
    r = 13 * s
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0xff, 0x3d, 0x7f))
px = im.load()
W, H = im.size

def hsv(p):
    h, sat, v = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
    return h * 360, sat, v

def fam(p):
    h, sat, v = hsv(p)
    # Lit bodies (the shader keeps at least 72% of the body colour) apart from the dim family: streaks
    # (#662248, #1c3875) and stopped bodies (#72244d, #1d3d80) read under v 0.65.
    if 315 <= h <= 352 and sat > 0.55 and v > 0.25:
        return 'pinkLit' if v > 0.65 else 'pinkDim'
    if 205 <= h <= 228 and sat > 0.6 and v > 0.3:
        return 'blueLit' if v > 0.65 else 'blueDim'
    if all(abs(a - b) <= 12 for a, b in zip(p, (0x66, 0x54, 0x1c))):
        return 'glow'
    if 38 <= h <= 56 and sat > 0.8 and v > 0.85:
        return 'gold'
    if sat < 0.35 and v > 0.55:
        return 'light'
    return None

def region(fx0, fy0, fx1, fy1):
    (x0, y0), (x1, y1) = S(fx0, fy0), S(fx1, fy1)
    return range(max(0, int(x0)), min(W, int(x1))), range(max(0, int(y0)), min(H, int(y1)))

out = {'scale': round(s, 4), 'frameOrigin': [round(ox, 1), round(oy, 1)]}
# Lane band: right of the plates column to the track's right edge, top of lane 1 to bottom of lane 20,
# with the finish column (gold line and its glow, 1728-1752) excluded so gold there is the line, not a marble.
LANE_Y0, LANE_DY, PLATE_H = 140, 36.5, 32
counts = {k: 0 for k in ('pinkLit', 'pinkDim', 'blueLit', 'blueDim', 'glow', 'gold', 'light')}
lanes = [0] * 20
xs, ys = region(430, LANE_Y0 - 4, 1864, LANE_Y0 + LANE_DY * 19 + PLATE_H + 4)
# Padded 2 screen px each side: at a non-integer frame scale the strip's antialiased edge leaks past it.
x_fin0, _ = S(1728, 0)
x_fin1, _ = S(1752, 0)
x_fin0, x_fin1 = x_fin0 - 2, x_fin1 + 2
for y in ys:
    fy = (y - oy) / s
    lane = int((fy - LANE_Y0 + 2) // LANE_DY)
    for x in xs:
        if x_fin0 <= x < x_fin1:
            continue
        f = fam(px[x, y])
        if f:
            counts[f] += 1
            if 0 <= lane < 20:
                lanes[lane] += 1
out['laneBand'] = counts
out['laneBandPinkBlue'] = sum(counts[k] for k in ('pinkLit', 'pinkDim', 'blueLit', 'blueDim'))
out['lanesWithMarblePx'] = sum(1 for n in lanes if n >= 30)
# Controls.
def count(fx0, fy0, fx1, fy1, pred):
    xs, ys = region(fx0, fy0, fx1, fy1)
    return sum(1 for y in ys for x in xs if pred(px[x, y]))
out['finishGold'] = count(1736, LANE_Y0, 1744, LANE_Y0 + LANE_DY * 19 + PLATE_H, lambda p: fam(p) == 'gold')
near = lambda c: (lambda p: all(abs(p[i] - c[i]) <= 6 for i in range(3)))
out['platesRaisedOrGold'] = count(72, LANE_Y0, 412, LANE_Y0 + LANE_DY * 19 + PLATE_H, lambda p: near((0x23, 0x21, 0x4d))(p) or fam(p) == 'gold')
out['bandGoldOrLight'] = count(0, 900, 1920, 1080, lambda p: fam(p) in ('gold', 'light'))
print(json.dumps(out))
