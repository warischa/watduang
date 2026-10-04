#!/usr/bin/env python3
"""gh#250: 2x card art from the tracked 1254x1254 masters, by the gh#241 recipe, run from the repo root.

  python3 docs/verification/evidence/gh250/make_2x.py control          # recipe -> 1x, compared with public/art
  python3 docs/verification/evidence/gh250/make_2x.py ship <work_dir>  # 2x -> public/art/<id>-2x.webp + q table

Positive control first (`control`): each master goes through gh241/make_ship.py with the black point
recorded for it (gh242/grade-ship.jsonl, `bp`; the pilot's 3 for IMG_02_003), and the resulting 1x webp
must be byte-identical to public/art/<id>.webp. Only then is the same level-remap + trim reused for 2x.

2x size rule, per game: the 2x of its 1x (height 640, twice the 1x height), raised if a slot on the home
page needs more: natural width >= 2 x the widest rendered img box of any slot the game appears in
(measured: hero 423.2 CSS px, popular 353.3, shelf 133.7 at 1440). `ship` then picks, per file, the
highest cwebp -q (88 downward) whose output fits the 60 KB cap of scripts/public-orphan-check.mjs.
"""
import hashlib
import json
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image

CAP = 61440
HERE = os.path.dirname(os.path.abspath(__file__))
EV = os.path.dirname(HERE)
MASTERS = {
    'croc-bite': 'IMG_02_003', 'timebomb': 'IMG_03_001', 'short-stick': 'IMG_03_002', 'freeze-tap': 'IMG_03_003',
    'cannon-flag': 'IMG_03_004', 'power-meter': 'IMG_03_005', 'dice-loser': 'IMG_03_006',
    'how-close-is-near': 'IMG_03_007', 'pinocchio-luck': 'IMG_03_008', 'cursed-number': 'IMG_03_009',
    'wire-snip-panic': 'IMG_03_010', 'zero-trigger': 'IMG_03_011', 'one-bomb': 'IMG_03_012',
    'bangkok-drift': 'IMG_03_013',
}
# Widest rendered <img> box (CSS px) of any slot the game appears in, from the measured home page.
HERO_BOX, POPULAR_BOX, SHELF_BOX = 423.2, 353.3, 133.7
SLOT_MAX = {gid: SHELF_BOX for gid in MASTERS}
SLOT_MAX['croc-bite'] = HERO_BOX
for gid in ('pinocchio-luck', 'how-close-is-near', 'dice-loser'):
    SLOT_MAX[gid] = POPULAR_BOX


def black_points():
    bp = {'croc-bite': 3}
    for line in open(f'{EV}/gh242/grade-ship.jsonl'):
        r = json.loads(line)
        bp[r['id']] = r['bp']
    return bp


def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


def run(*cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def level_trim(master, black, work, gid):
    """The make_ship.py steps 1-2 verbatim: linear alpha remap (never a threshold), then -trim."""
    level, trim = f'{work}/{gid}.level.png', f'{work}/{gid}.trim.png'
    rgba = np.array(Image.open(master).convert('RGBA'))
    a = rgba[:, :, 3].astype(np.float64)
    if black > 0:
        a = np.where(a <= black, 0.0, np.rint((a - black) * 255.0 / (255.0 - black)))
    rgba[:, :, 3] = np.clip(a, 0, 255).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(level)
    run('magick', level, '-trim', '+repage', trim)
    return trim


def control(work):
    bps = black_points()
    ok = True
    for gid, m in MASTERS.items():
        out = f'{work}/{gid}.1x.webp'
        run('python3', f'{EV}/gh241/make_ship.py', f'images/{m}.png', str(bps[gid]), work, out)
        shipped = f'public/art/{gid}.webp'
        same = sha(out) == sha(shipped)
        ok &= same
        print(f'{gid}\t{m}\tbp={bps[gid]}\tregen {Image.open(out).size}\tshipped {Image.open(shipped).size}\t'
              f'bytes {os.path.getsize(out)}/{os.path.getsize(shipped)}\tbyte-identical={same}')
    sys.exit(0 if ok else 1)


def ship(work):
    bps = black_points()
    print('file\tmaster\tbp\ttrim\ttarget\tq\tbytes\tdims')
    for gid, m in MASTERS.items():
        trim = level_trim(f'images/{m}.png', bps[gid], work, gid)
        tw, th = Image.open(trim).size
        ar = tw / th
        w, h = round(640 * ar), 640
        need = math.ceil(2 * SLOT_MAX[gid])
        if w < need:
            w, h = need, round(need / ar)
        if w > tw:
            raise SystemExit(f'{gid}: target {w}px is wider than the trimmed master {tw}px, would upscale')
        fit = f'{work}/{gid}.2x.png'
        run('magick', trim, '-resize', f'{w}x{h}!', fit)
        out = f'public/art/{gid}-2x.webp'
        chosen = None
        for q in range(88, 39, -1):
            run('cwebp', '-quiet', '-q', str(q), '-alpha_q', '100', '-m', '6', '-sharp_yuv', fit, '-o', out)
            if os.path.getsize(out) <= CAP:
                chosen = q
                break
        if chosen is None:
            raise SystemExit(f'{gid}: no q >= 40 fits {CAP} B')
        print(f'{gid}-2x.webp\t{m}\t{bps[gid]}\t{tw}x{th}\t{w}x{h}\tq{chosen}\t{os.path.getsize(out)}\t{Image.open(out).size[0]}x{Image.open(out).size[1]}')


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('control', 'ship'):
        sys.exit(__doc__)
    os.makedirs(sys.argv[2], exist_ok=True)
    {'control': control, 'ship': ship}[sys.argv[1]](sys.argv[2])
