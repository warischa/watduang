#!/usr/bin/env python3
"""Raw master -> cleaned cutout -> ship derivative, for the gh#241 game-card art pilot.

Usage: python3 make_ship.py <raw_master.png> <black_point> <work_dir> <out.webp>

Steps, in this order (each one writes a file into work_dir so it can be graded on its own):
  1. <stem>.level.png   alpha level remap: a' = 0 when a <= black_point, otherwise
                        round((a - black_point) * 255 / (255 - black_point)). A linear remap, NOT
                        a threshold: every alpha above the black point keeps its ordering, so the
                        anti-aliased edge stays smooth (gh#102 found -threshold jags it).
                        black_point 0 leaves the alpha untouched.
  2. <stem>.trim.png    magick -trim +repage (transparent padding stripped)
  3. <stem>.fit.png     magick -resize 502x320 (fit inside the proposed slot at 2x: 251x160 CSS px)
  4. out.webp           cwebp -q 88 -alpha_q 100 -m 6 -sharp_yuv (lossy colour, lossless alpha)
  5. <stem>.decoded.png dwebp of out.webp, so the shipped bytes themselves can be graded
"""
import os
import subprocess
import sys

import numpy as np
from PIL import Image

SLOT_2X = "502x320"


def run(*cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def main():
    raw, black, work, out = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
    stem = os.path.splitext(os.path.basename(out))[0]
    level = os.path.join(work, f"{stem}.level.png")
    trim = os.path.join(work, f"{stem}.trim.png")
    fit = os.path.join(work, f"{stem}.fit.png")
    decoded = os.path.join(work, f"{stem}.decoded.png")

    rgba = np.array(Image.open(raw).convert("RGBA"))
    a = rgba[:, :, 3].astype(np.float64)
    if black > 0:
        a = np.where(a <= black, 0.0, np.rint((a - black) * 255.0 / (255.0 - black)))
    rgba[:, :, 3] = np.clip(a, 0, 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(level)

    run("magick", level, "-trim", "+repage", trim)
    run("magick", trim, "-resize", SLOT_2X, fit)
    run("cwebp", "-quiet", "-q", "88", "-alpha_q", "100", "-m", "6", "-sharp_yuv", fit, "-o", out)
    run("dwebp", "-quiet", out, "-o", decoded)
    for p in (level, trim, fit, out, decoded):
        w, h = Image.open(p).size
        print(f"{p}\t{w}x{h}\t{os.path.getsize(p)} bytes")


if __name__ == "__main__":
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    main()
