# usage: python3 -I sample.py <png> <json {"dsf":n,"pts":[[x,y],...]}> -> JSON list of [r,g,b] at CSS-px points
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
a = json.loads(sys.argv[2])
d = a['dsf']
out = []
for x, y in a['pts']:
    px = min(max(int(x * d), 0), im.width - 1); py = min(max(int(y * d), 0), im.height - 1)
    out.append(list(im.getpixel((px, py))))
print(json.dumps({'size': im.size, 'pix': out}))
