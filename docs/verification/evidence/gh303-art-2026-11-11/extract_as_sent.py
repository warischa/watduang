#!/usr/bin/env python3
"""Per render: find the Codex session whose user message names renders/<id>/<id>.png, list every image_gen
call in order (Codex's revised prompt, transparent_background, whether it referenced a previous output,
output sha256 from the item's savedPath), and mark picked = output sha256 equals the saved master.
Adapted from gh#242's extract_as_sent.py for codex-cli 0.167.0, whose log names the item's output file
(savedPath) instead of leaving it to be derived. Usage: extract_as_sent.py <out.json> IMG_04_00N ..."""
import glob, hashlib, json, os, re, sys

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SESS = sorted(glob.glob(os.path.expanduser('~/.codex/sessions/2026/11/11/rollout-*.jsonl')))
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()

out = []
for img in sys.argv[2:]:
    master = f'{S}/renders/{img}/{img}.png'
    msha = sha(master)
    rec = None
    for f in SESS:
        if f'renders/{img}/{img}.png' not in open(f).read(): continue
        calls, args, thread, version = [], [], None, None
        for line in open(f):
            e = json.loads(line); p = e.get('payload', {})
            if e.get('type') == 'session_meta': thread, version = p.get('id'), p.get('cli_version')
            if p.get('type') == 'custom_tool_call' and 'image_gen__imagegen' in str(p.get('input', '')):
                for m in re.finditer(r'image_gen__imagegen\(\{([^)]*)\}\)', p['input']):
                    args.append({'transparent_background_arg': 'transparent_background:true' in m.group(1).replace(' ', ''),
                                 'edit_of_previous_image': 'generated_images' in m.group(1),
                                 'style_ref_in_call': 'IMG_02_003' in m.group(1)})
            it = p.get('item', {}) if p.get('type') == 'item_completed' else {}
            if it.get('kind') == 'image_gen.generation':
                fp = it.get('savedPath')
                calls.append({'generation_id': it.get('id'), 'status': it.get('status'),
                              'transparentBackground_result': it.get('transparentBackground'),
                              'sha256': sha(fp) if fp and os.path.exists(fp) else None,
                              'prompt_as_sent_to_image_gen': it.get('revisedPrompt')})
        for i, c in enumerate(calls):
            if i < len(args): c.update(args[i])
            c['picked'] = c['sha256'] == msha
        if any(c['picked'] for c in calls):
            rec = {'id': img, 'codex_session': thread, 'codex_cli_version': version, 'image_gen_calls': len(calls),
                   'master_sha256': msha, 'calls': calls}
    if rec is None:
        sys.exit(f'{img}: no session call whose output hash matches the master')
    out.append(rec)

json.dump({'_about': 'Extracted from each Codex session log (~/.codex/sessions/2026/11/11/rollout-*.jsonl): every image_gen call Codex made for one gh303-art render, in order, with the prompt Codex itself wrote for the tool (Codex rewrites the prompt it is given, so these are NOT the registry text). picked = the call whose output sha256 equals the file Codex saved to the requested path, which is the file copied byte-identical to images/. transparent_background_arg is read from the tool-call source Codex wrote; transparentBackground_result from the completed item.',
           'renders': out}, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
for r in out:
    print(r['id'], 'calls', r['image_gen_calls'], 'picked#', [i + 1 for i, c in enumerate(r['calls']) if c['picked']],
          'tb', [c.get('transparent_background_arg') for c in r['calls']], 'tbres', [c['transparentBackground_result'] for c in r['calls']])
