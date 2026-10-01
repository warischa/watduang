#!/usr/bin/env python3
"""Cutout grader for the gh#241 game-card art pilot.

Usage: python3 grade.py <file.png|file.webp> [...]

Prints one JSON line per file. What each field counts:
  channels        ImageMagick's %[channels] for the file (must be "srgba" for a cutout)
  size            width x height in pixels
  alpha_mean      mean of the alpha channel, 0..1 (informational only: a painted checkerboard
                  scored 0.998 here and still passed a "< 1" test, so this is never the pass)
  transparent     fraction of pixels whose alpha is exactly 0
  corners         alpha (0..255) of the four corner pixels, order TL, TR, BL, BR
  band            pixels with alpha 1..25 (the residual band gh#102 measured)
  haze_outside    band pixels that lie OUTSIDE the solid mask dilated by a radius-4 Euclidean
                  disk; "solid" means alpha >= 26. Must be 0: a band pixel inside the dilated
                  mask sits on the subject's own anti-aliased edge, one outside it is stray haze.
  mid             pixels with alpha 26..229 (anti-aliased edge plus any soft shadow pool; near-
                  opaque values 230..254 are left out because a level remap parks solid pixels there)

The structuring element is scipy.ndimage.binary_dilation with a disk of radius 4 (every offset
with dx*dx + dy*dy <= 16), not ImageMagick's Disk:4 kernel; the two differ slightly at the rim.
WebP input is decoded by Pillow; the channel string then comes from ImageMagick reading the webp.
"""
import json
import subprocess
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation

SOLID_MIN = 26
BAND_MAX = 25
RADIUS = 4


def disk(radius):
    r = np.arange(-radius, radius + 1)
    return (r[:, None] ** 2 + r[None, :] ** 2) <= radius * radius


def grade(path):
    channels = subprocess.run(
        ["magick", "identify", "-format", "%[channels]", path],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    img = Image.open(path)
    img.load()
    if "A" not in img.getbands():
        w, h = img.size
        return {
            "file": path, "channels": channels, "size": f"{w}x{h}", "alpha_mean": 1.0,
            "transparent": 0.0, "corners": [255, 255, 255, 255], "band": 0,
            "haze_outside": 0, "mid": 0, "note": "no alpha band at all",
        }
    a = np.asarray(img.convert("RGBA"))[:, :, 3].astype(np.int32)
    h, w = a.shape
    solid = a >= SOLID_MIN
    band = (a >= 1) & (a <= BAND_MAX)
    grown = binary_dilation(solid, structure=disk(RADIUS))
    return {
        "file": path,
        "channels": channels,
        "size": f"{w}x{h}",
        "alpha_mean": round(float(a.mean()) / 255.0, 4),
        "transparent": round(float((a == 0).mean()), 4),
        "corners": [int(a[0, 0]), int(a[0, w - 1]), int(a[h - 1, 0]), int(a[h - 1, w - 1])],
        "band": int(band.sum()),
        "haze_outside": int((band & ~grown).sum()),
        "mid": int(((a >= SOLID_MIN) & (a <= 229)).sum()),
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for p in sys.argv[1:]:
        print(json.dumps(grade(p), ensure_ascii=True))
