#!/usr/bin/env python3
"""Compose each gh303-art prompt: the Direction C reuse template (read from the registry, byte-identical),
with the cover's own Subject: placed second, as gh#242 did. Writes prompts/<id>.txt and prompts/<id>.sent.txt
(the latter = the full string handed to codex exec, style-reference prefix and save line included)."""
import json, os, re

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REG = '/Users/waris.c/claude/free-game/images/IMAGES.md'
ANCHOR = '/Users/waris.c/claude/free-game/images/IMG_02_003.png'
lines = open(REG, encoding='utf-8').read().split('\n')
start = next(i for i, l in enumerate(lines) if l.startswith('**Direction C reuse template'))
tpl = [l[4:] for l in lines[start:start + 20] if l.startswith('    ') and re.match(r'    (Scene|Style/medium|Composition/framing|Color palette|Constraints):', l)]
assert len(tpl) == 5, tpl
scene, rest = tpl[0], tpl[1:]
subs = json.load(open(f'{S}/tools/subjects.json', encoding='utf-8'))
for img, d in subs.items():
    prompt = '\n\n'.join([scene, d['subject'], *rest])
    open(f'{S}/prompts/{img}.txt', 'w', encoding='utf-8').write(prompt)
    out = f'{S}/renders/{img}/{img}.png'
    sent = (f'Input images: image 1 ({ANCHOR}) is a STYLE REFERENCE only - match its rendering style, lighting and '
            f'material finish; do not copy its subject.\n\n{prompt} Save the final PNG to: {out}')
    open(f'{S}/prompts/{img}.sent.txt', 'w', encoding='utf-8').write(sent)
    os.makedirs(f'{S}/renders/{img}', exist_ok=True)
    print(img, d['slug'], len(prompt))
