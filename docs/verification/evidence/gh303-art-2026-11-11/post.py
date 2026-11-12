#!/usr/bin/env python3
"""After one render: (1) prove nothing entered the repo — git status vs baseline, sha256 of every file
under public/ and images/ vs baseline, ls public/art | wc -l; (2) grade the raw render (gh241 grade.py),
black point by the gh#242 ship_all rule, a scratch-only ship webp via gh241 make_ship.py, the partial-alpha
tripwire, and flattened look images on the party ground, the two K1 candidate grounds and ink.
Usage: post.py IMG_04_00N   Prints one JSON line."""
import json, os, subprocess, sys
import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation

R = '/Users/waris.c/claude/free-game'
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV = f'{R}/docs/verification/evidence/gh241'
r = np.arange(-4, 5); DISK = (r[:, None] ** 2 + r[None, :] ** 2) <= 16
GROUNDS = {'punch': '#ff3d7f', 'lilac': '#c9c2ff', 'night': '#23214d', 'ink': '#1a1a1a'}

def sh(*c, **k): return subprocess.run(c, capture_output=True, text=True, **k)

def repo_proof():
    st = sh('git', '-C', R, 'status', '--short').stdout.splitlines()
    base = open(f'{S}/baseline.status').read().splitlines()
    now = sh('bash', '-c', f'cd {R} && find public images -type f -print0 | sort -z | xargs -0 shasum -a 256').stdout.splitlines()
    bl = open(f'{S}/baseline.sha').read().splitlines()
    art = int(sh('bash', '-c', f'ls {R}/public/art | wc -l').stdout.strip())
    return {'status_new': sorted(set(st) - set(base)), 'status_gone': sorted(set(base) - set(st)),
            'public_images_hash_new': sorted(set(now) - set(bl)), 'public_images_hash_gone': sorted(set(bl) - set(now)),
            'public_art_entries': art}

def black_point(png):
    a = np.array(Image.open(png).convert('RGBA'))[:, :, 3]
    outside = ~binary_dilation(a >= 26, structure=DISK)
    haze = a[outside & (a > 0) & (a <= 25)]
    return (int(haze.max()) if haze.size else 0), int(haze.size)

def main(img):
    out = {'id': img, 'repo': repo_proof()}
    raw = f'{S}/renders/{img}/{img}.png'
    if not os.path.exists(raw):
        out['error'] = 'no render'; print(json.dumps(out)); return
    out['sha256'] = sh('shasum', '-a', '256', raw).stdout.split()[0]
    g = json.loads(sh('python3', f'{EV}/grade.py', raw, check=True).stdout)
    out['raw'] = {k: g[k] for k in ('channels', 'size', 'transparent', 'haze_outside', 'corners')}
    a = np.array(Image.open(raw).convert('RGBA'))[:, :, 3].astype(float) / 255
    out['raw']['partial_alpha_pct'] = round(float(((a > 0.05) & (a < 0.95)).mean() * 100), 3)
    bp, nh = black_point(raw)
    out['bp'] = bp
    work = f'{S}/ship/{img}'; os.makedirs(work, exist_ok=True)
    webp = f'{work}/{img}.webp'
    sh('python3', f'{EV}/make_ship.py', raw, str(bp), work, webp, check=True)
    s = json.loads(sh('python3', f'{EV}/grade.py', webp, check=True).stdout)
    out['ship'] = {'size': s['size'], 'bytes': os.path.getsize(webp), 'transparent': s['transparent'],
                   'haze': s['haze_outside'], 'corners': s['corners'], 'channels': s['channels']}
    flags = []
    if not s['channels'].startswith('srgba'): flags.append('not srgba')
    if s['haze_outside'] != 0: flags.append('haze')
    if any(s['corners']): flags.append('corners')
    if os.path.getsize(webp) > 61440: flags.append('over 60KB')
    if bp > 5: flags.append(f'black point {bp} > 5')
    out['flags'] = flags
    trim = f'{S}/look/{img}.trim.png'
    sh('magick', raw, '-trim', '+repage', trim, check=True)
    sh('magick', *[x for t, c in GROUNDS.items() for x in ('(', trim, '-resize', '600x600', '-background', c, '-gravity', 'center', '-extent', '620x620', '-flatten', ')')],
       '+append', f'{S}/look/{img}.grounds.png', check=True)
    print(json.dumps(out))

if __name__ == '__main__':
    main(sys.argv[1])
