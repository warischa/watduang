#!/usr/bin/env python3
"""Scratch-only 1x + 2x ship for one master. Usage: ship_scratch.py <master.png> <bp> <outdir> <stem>
1x = gh241 make_ship.py unchanged; 2x = gh250 level_trim (imported) + resize to fit 1004x640 (twice the 502x320 slot box) + cwebp q88 downward to the 60KB cap.
Never writes outside <outdir>. The repo root is resolved from this file's own location at runtime."""
import hashlib, json, os, subprocess, sys, math
sys.dont_write_bytecode = True
R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..'))
sys.path.insert(0, f'{R}/docs/verification/evidence/gh250')
import make_2x
from PIL import Image
master, bp, out, stem = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
os.makedirs(out, exist_ok=True)
one = f'{out}/{stem}.webp'
subprocess.run(['python3', '-B', f'{R}/docs/verification/evidence/gh241/make_ship.py', master, str(bp), out, one], check=True, capture_output=True)
trim = make_2x.level_trim(master, bp, out, stem)
tw, th = Image.open(trim).size
w, h = round(640 * tw / th), 640
if w > 1004:  # wide subject: the 1x is width-limited at 502, so the 2x is 1004 wide (twice the 1x slot box), not 640 high
    w, h = 1004, round(1004 * th / tw)
if w > tw or h > th: sys.exit(f'2x target {w}x{h} would upscale the {tw}x{th} trim')
fit = f'{out}/{stem}.2x.png'
subprocess.run(['magick', trim, '-resize', f'{w}x{h}!', fit], check=True)
two = f'{out}/{stem}-2x.webp'
chosen = None
for q in range(88, 39, -1):
    subprocess.run(['cwebp', '-quiet', '-q', str(q), '-alpha_q', '100', '-m', '6', '-sharp_yuv', fit, '-o', two], check=True)
    if os.path.getsize(two) <= make_2x.CAP: chosen = q; break
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
print(json.dumps({'stem': stem, 'bp': bp, 'trim': f'{tw}x{th}', '1x': {'size': Image.open(one).size, 'bytes': os.path.getsize(one), 'sha': sha(one)},
                  '2x': {'size': Image.open(two).size, 'bytes': os.path.getsize(two), 'q': chosen, 'sha': sha(two)}}))
