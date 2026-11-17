#!/usr/bin/env python3
"""Contact sheet per game: candidates A (top row) and B (bottom row), each ship webp flattened on the four look-check grounds. ASCII labels."""
import subprocess, sys
FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
G = [('punch', '#ff3d7f'), ('lilac', '#c9c2ff'), ('night', '#23214d'), ('ink', '#1a1a1a')]
ship, out, game, a, b = sys.argv[1:6]
args = []
for lab, img in (('A', a), ('B', b)):
    for n, c in G:
        t = f'{out}/_t_{img}_{n}.png'
        subprocess.run(['magick', '-size', '480x400', f'xc:{c}', '(', f'{ship}/{img}/{img}.webp', '-resize', '440x360', ')', '-gravity', 'center', '-composite', t], check=True)
        args += ['-label', f'{lab} {img} on {c}', t]
subprocess.run(['magick', 'montage', *args, '-title', f'{game}: candidate A (top) vs B (bottom), flattened on the four look-check colours',
                '-tile', '4x2', '-geometry', '+8+8', '-font', FONT, '-pointsize', '20', '-background', 'white', '-depth', '8', f'{out}/contact-{game}.png'], check=True)
