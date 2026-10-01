#!/usr/bin/env python3
"""Owner comparison sheet for the gh#241 style pilot.

Usage: python3 make_compare.py <work_dir> <out.png>   (run from the repo root)

Each ship derivative in images/gh241-ship/ is composited, object-fit: contain and centred, onto a
#f89880 box the size of the proposed card art slot: 502x320 (the 251x160 CSS px slot on a 2x
screen, the density the derivative is cut for) on the top row, 251x160 (1x) on the bottom row.
Labels are drawn by montage below each tile, outside the art.
"""
import os
import subprocess
import sys

CORAL = "#f89880"
# ImageMagick on this machine has no default font, so labels name a system font file outright.
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
SHIP = "images/gh241-ship"
CANDIDATES = [
    ("IMG_02_001", "A  flat editorial"),
    ("IMG_02_002", "B  bold sticker pop"),
    ("IMG_02_003", "C  soft 3D toy"),
]


def run(*cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def main():
    work, out = sys.argv[1], sys.argv[2]
    rows = []
    for scale, box in (("2x", "502x320"), ("1x", "251x160")):
        args = []
        for stem, label in CANDIDATES:
            tile = os.path.join(work, f"{stem}.tile{scale}.png")
            run("magick", "-size", box, f"xc:{CORAL}",
                "(", os.path.join(SHIP, f"{stem}.webp"), "-resize", box, ")",
                "-gravity", "center", "-composite", tile)
            args += ["-label", f"{label}  {scale}" if scale == "2x" else f"{label[0]}  {scale}", tile]
        row = os.path.join(work, f"row{scale}.png")
        title = ["-title", "croc-bite card art slot 251x160 CSS px on #f89880 - top 2x (502x320), bottom 1x"] \
            if scale == "2x" else []
        run("magick", "montage", *args, *title, "-tile", "3x1", "-geometry", "+18+14",
            "-font", FONT, "-pointsize", "16", "-background", "white", row)
        rows.append(row)
    run("magick", *rows, "-background", "white", "-gravity", "center", "-append",
        "-bordercolor", "white", "-border", "12", "+repage", "-depth", "8", out)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main()
