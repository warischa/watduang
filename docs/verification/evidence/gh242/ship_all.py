#!/usr/bin/env python3
"""For each render: black point = max alpha of haze outside the dilated solid mask (gh#241 rule),
then make_ship.py, grade the shipped webp, write a coral/ink look sheet. Flags anything off-spec."""
import json, os, subprocess, sys
import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation

REPO = '/Users/waris.c/claude/free-game'
S = os.path.dirname(os.path.abspath(__file__))
EV = f'{REPO}/docs/verification/evidence/gh241'
r = np.arange(-4, 5); DISK = (r[:, None] ** 2 + r[None, :] ** 2) <= 16

def black_point(png):
    a = np.array(Image.open(png).convert('RGBA'))[:, :, 3]
    outside = ~binary_dilation(a >= 26, structure=DISK)
    haze = a[outside & (a > 0) & (a <= 25)]
    return (int(haze.max()) if haze.size else 0), int(haze.size)

ids = sys.argv[1:] or sorted(d for d in os.listdir(f'{S}/renders') if '.' not in d)
for gid in ids:
    raw = f'{S}/renders/{gid}/{gid}.png'
    if not os.path.exists(raw):
        print(json.dumps({'id': gid, 'error': 'no render'})); continue
    raw_grade = json.loads(subprocess.run(['python3', f'{EV}/grade.py', raw], capture_output=True, text=True, check=True).stdout)
    bp, nhaze = black_point(raw)
    work = f'{S}/ship/{gid}'; os.makedirs(work, exist_ok=True)
    out = f'{work}/{gid}.webp'
    subprocess.run(['python3', f'{EV}/make_ship.py', raw, str(bp), work, out], check=True, capture_output=True)
    g = json.loads(subprocess.run(['python3', f'{EV}/grade.py', out], capture_output=True, text=True, check=True).stdout)
    for bg, tag in (('#f89880', 'coral'), ('#1a1a1a', 'ink')):
        subprocess.run(['magick', out, '-background', bg, '-flatten', f'{work}/look-{tag}.png'], check=True)
    flags = []
    if not g['channels'].startswith('srgba'): flags.append('not srgba')
    if g['haze_outside'] != 0: flags.append(f"haze {g['haze_outside']}")
    if any(g['corners']): flags.append(f"corners {g['corners']}")
    if os.path.getsize(out) > 61440: flags.append('over 60KB')
    if bp > 5: flags.append(f'black point {bp} > 5 (soft element?)')
    print(json.dumps({'id': gid, 'raw_transparent': raw_grade['transparent'], 'raw_haze': raw_grade['haze_outside'],
                      'bp': bp, 'size': g['size'], 'bytes': os.path.getsize(out), 'transparent': g['transparent'],
                      'haze': g['haze_outside'], 'corners': g['corners'], 'flags': flags}))
