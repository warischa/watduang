# usage: python3 -I runscans.py <scan.py> <after-manifest> <out.json> label=dir ...
import json, subprocess, sys
scan, man, outp = sys.argv[1:4]
rects = {r['file']: r['rect'] for r in json.load(open(man)) if r.get('rect')}
frames = ['prize-marbles-1440-mid.png', 'prize-marbles-1440-freeze.png', 'prize-marbles-1920-mid.png', 'prize-marbles-1920-freeze.png', 'projector-marbles-1920-mid.png', 'projector-marbles-1920-freeze.png']
res = {}
for arg in sys.argv[4:]:
    label, d = arg.split('=', 1)
    for f in frames:
        q = rects[f]
        try:
            o = subprocess.run(['python3', '-I', scan, f'{d}/{f}', *map(str, (q['x'], q['y'], q['w'], q['h']))], capture_output=True, text=True, check=True).stdout
            res.setdefault(f, {})[label] = json.loads(o)
        except subprocess.CalledProcessError:
            pass
json.dump(res, open(outp, 'w'), indent=1)
for f, legs in res.items():
    for label, r in legs.items():
        lb = r['laneBand']
        print(f, label, 'pinkBlue', r['laneBandPinkBlue'], 'lit', lb['pinkLit'] + lb['blueLit'], 'dim', lb['pinkDim'] + lb['blueDim'], 'glow', lb['glow'], 'gold', lb['gold'], 'light', lb['light'], 'lanes', r['lanesWithMarblePx'], '| finish', r['finishGold'], 'plates', r['platesRaisedOrGold'], 'band', r['bandGoldOrLight'])
