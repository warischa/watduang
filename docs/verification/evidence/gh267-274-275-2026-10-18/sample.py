# usage: python3 -I sample.py <png> <json [x,y,w,h,dsf]> -> prints JSON list of [r,g,b] on a 9x5 interior grid (inset 12%)
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
x, y, w, h, d = json.loads(sys.argv[2])
pts = []
for i in range(9):
    for j in range(5):
        px = int((x + w * (0.12 + 0.76 * i / 8)) * d); py = int((y + h * (0.12 + 0.76 * j / 4)) * d)
        px = min(max(px, 0), im.width - 1); py = min(max(py, 0), im.height - 1)
        pts.append(list(im.getpixel((px, py))))
print(json.dumps({'size': im.size, 'pts': pts}))
