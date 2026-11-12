const lean = await import('<pkgs>/node_modules/lean-qr/index.mjs');
const qrMod = await import('<pkgs>/node_modules/qr/index.js');
const jsQRmod = await import('<pkgs>/node_modules/jsqr/dist/jsQR.js'); const jsQR = jsQRmod.default?.default ?? jsQRmod.default;
const urls = ['https://watduang.com/party/prize-draw/join/?e=48291', 'https://watduang.com/company/new-year-draw/join/?pin=482913&x=AbC'];
function decode(size, get) {
  const q = 4, sc = 6, W = (size + 2 * q) * sc, px = new Uint8ClampedArray(W * W * 4).fill(255);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (get(x, y))
    for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) { const i = (((y + q) * sc + dy) * W + (x + q) * sc + dx) * 4; px[i] = px[i+1] = px[i+2] = 0; }
  const r = jsQR(px, W, W); return r ? r.data : null;
}
let fails = 0;
for (const u of urls) {
  for (const lvl of ['default', 'M', 'Q']) {
    const opts = lvl === 'default' ? {} : { minCorrectionLevel: lean.correction[lvl] };
    const b = lean.generate(u, opts);
    const ok = decode(b.size, (x, y) => b.get(x, y)) === u; if (!ok) fails++;
    console.log('lean', lvl, 'size', b.size, ok ? 'ROUNDTRIP' : 'FAIL');
  }
  const enc = qrMod.default ?? qrMod.encodeQR;
  for (const ecc of ['medium', 'quartile']) {
    const m = enc(u, 'raw', { ecc }); const ok = decode(m.length, (x, y) => m[y][x]) === u; if (!ok) fails++;
    console.log('qr', ecc, 'size', m.length, ok ? 'ROUNDTRIP' : 'FAIL');
  }
}
const b = lean.generate(urls[0]);
const bad = decode(b.size, (x, y) => (x < 9 && y < 9) ? !b.get(x, y) : b.get(x, y));
console.log('must-red corrupted finder ->', bad === urls[0] ? 'STILL DECODES (bad control)' : 'decode fails (control ok)');
process.exit(fails ? 1 : 0);
