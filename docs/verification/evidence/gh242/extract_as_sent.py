#!/usr/bin/env python3
"""Per render: find the Codex session whose user message names renders/<id>/, list every image_gen
call in order (revised prompt, transparent_background arg, edit-or-generate, output sha256), and mark
picked = output sha256 equals the saved master. Writes as-sent-prompts.json for gh#242."""
import glob, hashlib, json, os, re, sys

S = os.path.dirname(os.path.abspath(__file__))
IDS = json.load(open(f'{S}/ids.json'))  # {game_id: IMG id}
SESS = sorted(glob.glob(os.path.expanduser('~/.codex/sessions/2026/10/04/rollout-*.jsonl')))
GEN = os.path.expanduser('~/.codex/generated_images')
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()

out = []
for gid, img in IDS.items():
    master = f'{S}/renders/{gid}/{gid}.png'
    msha = sha(master)
    hits = [f for f in SESS if f'renders/{gid}/{gid}.png' in open(f).read()]
    rec = None
    for f in hits:
        calls, args = [], []
        thread = None
        for line in open(f):
            e = json.loads(line); p = e.get('payload', {})
            if e.get('type') == 'session_meta': thread = p.get('id')
            if p.get('type') == 'custom_tool_call' and 'image_gen__imagegen' in p.get('input', ''):
                inp = p['input']
                args.append({'transparent_background_arg': bool(re.search(r'transparent_background:\s*true', inp)),
                             'refs': re.findall(r'referenced_image_paths:\[([^\]]*)\]', inp)})
            it = p.get('item', {}) if p.get('type') == 'item_completed' else {}
            if it.get('kind') == 'image_gen.generation':
                fp = os.path.join(GEN, thread or '', f"{it['id']}.png")
                calls.append({'generation_id': it['id'], 'status': it.get('status'),
                              'sha256': sha(fp) if os.path.exists(fp) else None,
                              'prompt_as_sent_to_image_gen': it.get('revisedPrompt')})
        for c, a in zip(calls, args):
            c['transparent_background_arg'] = a['transparent_background_arg']
            c['edit_of_previous_image'] = 'generated_images' in ''.join(a['refs'])
            c['picked'] = c['sha256'] == msha
        if any(c['picked'] for c in calls):
            rec = {'id': img, 'game': gid, 'codex_session': thread, 'image_gen_calls': len(calls),
                   'master_sha256': msha, 'calls': calls}
    if rec is None:
        sys.exit(f'{gid}: no session call whose output hash matches the master')
    out.append(rec)

json.dump({'_about': 'Extracted from each Codex session log (~/.codex/sessions/2026/10/04/rollout-*.jsonl): every image_gen call Codex made for one gh#242 render, in order, with the prompt Codex itself wrote for the tool (Codex rewrites the prompt it is given, so these are NOT the registry text) and the tool arguments it passed. picked = the call whose output sha256 equals the file Codex saved to the requested path, which is the file copied byte-identical to images/.',
           'renders': out}, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
for r in out:
    print(r['id'], r['game'], 'calls', r['image_gen_calls'], 'picked#', [i + 1 for i, c in enumerate(r['calls']) if c['picked']],
          'tb', all(c['transparent_background_arg'] for c in r['calls']), 'edits', sum(c['edit_of_previous_image'] for c in r['calls']))
