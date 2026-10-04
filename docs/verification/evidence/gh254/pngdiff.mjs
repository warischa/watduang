// gh#254 evidence: pixel-diff two directories of same-named PNGs (8-bit RGB/RGBA, non-interlaced,
// which is what Chrome's captureScreenshot emits). No dependencies: node:zlib plus the PNG filters.
//
//   node docs/verification/evidence/gh254/pngdiff.mjs <dirA> <dirB>
//
// Prints per file: dimensions of both, count of differing pixels, and the bounding box of the diff.
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function decode(buf) {
  let o = 8, w = 0, h = 0, ct = 0, bd = 0; const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; if (d[12] !== 0) throw new Error('interlaced'); }
    if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  if (bd !== 8 || (ct !== 2 && ct !== 6)) throw new Error(`unsupported png bd=${bd} ct=${ct}`);
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp, raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}

const [dirA, dirB] = process.argv.slice(2);
const files = readdirSync(dirA).filter((f) => f.endsWith('.png')).sort();
let total = 0;
for (const f of files) {
  const a = decode(readFileSync(`${dirA}/${f}`));
  let b; try { b = decode(readFileSync(`${dirB}/${f}`)); } catch (e) { console.log(`${f}  MISSING/BAD in B: ${e.message}`); total += 1; continue; }
  if (a.w !== b.w || a.h !== b.h) { console.log(`${f}  SIZE ${a.w}x${a.h} vs ${b.w}x${b.h}`); total += 1; continue; }
  let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    let d = false;
    for (let k = 0; k < 3; k++) if (a.px[(y * a.w + x) * a.bpp + k] !== b.px[(y * b.w + x) * b.bpp + k]) d = true;
    if (d) { n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  total += n;
  console.log(`${f}  ${a.w}x${a.h}  diff=${n}` + (n ? `  bbox=${x0},${y0}-${x1},${y1}` : ''));
}
console.log(`TOTAL differing pixels: ${total} over ${files.length} files`);
