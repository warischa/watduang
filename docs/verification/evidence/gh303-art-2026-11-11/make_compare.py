#!/usr/bin/env python3
"""Owner comparison sheets for the gh303-art candidates (adapted from gh241 make_compare.py).

Usage: make_compare.py <ship_dir> <out_dir>
  <ship_dir>/<IMG>/<IMG>.webp are the scratch ship derivatives (gh241 make_ship.py, never in public/).
Sheet 1, compare-style.png: one row per cover — a shipped party card, then that cover's two candidates —
  each composited object-fit: contain, centred, on the party card ground (--accent-punch #ff3d7f) in the
  2x card art slot box 502x320 (the 251x160 CSS px .game-card-art box).
Sheet 2, compare-grounds.png: every candidate at 1x (251x160) on the two gh#303 K1 accent options,
  lilac #c9c2ff and night #23214d, croc-bite first as the reference.
Labels are ASCII, drawn by montage below each tile with an explicit font file."""
import os, subprocess, sys

FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
ART = '/Users/waris.c/claude/free-game/public/art'
ROWS = [
    ('croc-bite', 'event', ('IMG_04_001', 'IMG_04_002')),
    ('timebomb', 'fireworks', ('IMG_04_003', 'IMG_04_004')),
    ('dice-loser', 'cards', ('IMG_04_005', 'IMG_04_006')),
    ('bangkok-drift', 'ladder', ('IMG_04_007', 'IMG_04_008')),
]
GROUNDS = (('lilac', '#c9c2ff'), ('night', '#23214d'))

def run(*c): subprocess.run(c, check=True, capture_output=True)

def tile(src, ground, box, out):
    run('magick', '-size', box, f'xc:{ground}', '(', src, '-resize', box, ')', '-gravity', 'center', '-composite', out)

def main(ship, outdir):
    work = os.path.join(outdir, '_work'); os.makedirs(work, exist_ok=True)
    args = []
    for ref, cover, ids in ROWS:
        t = f'{work}/{ref}.punch.png'; tile(f'{ART}/{ref}.webp', '#ff3d7f', '502x320', t)
        args += ['-label', f'shipped party: {ref}', t]
        for i, img in enumerate(ids):
            t = f'{work}/{img}.punch.png'; tile(f'{ship}/{img}/{img}.webp', '#ff3d7f', '502x320', t)
            args += ['-label', f'{cover} {"ab"[i]}: {img}', t]
    run('magick', 'montage', *args, '-title', 'vs shipped party cards: 2x slot 502x320 on #ff3d7f',
        '-tile', '3x4', '-geometry', '+16+12', '-font', FONT, '-pointsize', '18', '-background', 'white',
        '-depth', '8', os.path.join(outdir, 'compare-style.png'))
    rows = []
    for name, c in GROUNDS:
        a = []
        t = f'{work}/croc-bite.{name}.png'; tile(f'{ART}/croc-bite.webp', c, '251x160', t); a += ['-label', 'ref croc-bite', t]
        for _, cover, ids in ROWS:
            for i, img in enumerate(ids):
                t = f'{work}/{img}.{name}.png'; tile(f'{ship}/{img}/{img}.webp', c, '251x160', t)
                a += ['-label', f'{cover} {"ab"[i]}', t]
        row = f'{work}/row-{name}.png'
        run('magick', 'montage', *a, '-title', f'1x slot 251x160 on K1 option {name} {c}', '-tile', '9x1', '-geometry', '+10+8',
            '-font', FONT, '-pointsize', '14', '-background', 'white', row)
        rows.append(row)
    run('magick', *rows, '-background', 'white', '-append', '-depth', '8', os.path.join(outdir, 'compare-grounds.png'))

if __name__ == '__main__':
    if len(sys.argv) != 3: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
