#!/usr/bin/env node
// gh#326 PILOT ONLY: one real three.js still of browser-drawn Thai word textures at the D1 glyph floor, and its
// must-red twin below the floor. Not a kit file; sibling boards do not run it.
//
// What it proves: with three (node_modules/three, pinned 0.170.0) in headless Chrome, a Thai word drawn by the
// browser into a 2D canvas (so the browser shapes vowels and tone marks) and applied as a texture on a tilted 3D
// card renders with its INK at least as tall as the same word's ink drawn in 2D at the floor size. The check reads
// the rendered WebGL pixels, never the input size: per card, the rows holding text ink (luminance over 128 inside
// the card's projected box) against measureText's ink box at the floor.
//
// MODE=floor sizes the cards so the untilted on-screen font is 1.06 x the floor (1.00 missed by under 1px at the
// 20px floor, threshold rounding); measured 2026-11-20 the ink lands 0.4-1.9px above the floor's 2D ink at 14px and
// 20px. MODE=below sizes them at 0.75 x the floor, which must fail on its own line.
// Chrome must run with a live WebGL context (README: --headless=new --use-gl=angle --use-angle=swiftshader
// --enable-unsafe-swiftshader, never --disable-gpu); the page asserts the context itself.
// Usage: CDP_PORT=<port> SHOT_TMP=<scratch dir> MODE=floor|below node three-still.mjs   Exit 1 when the check fails.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIT_VALUE, KIT_OPT } from './kit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const PORT = process.env.CDP_PORT; const SHOT_TMP = process.env.SHOT_TMP; const MODE = process.env.MODE || 'floor';
if (!PORT || !SHOT_TMP || !['floor', 'below'].includes(MODE)) { console.error('usage: CDP_PORT=<port> SHOT_TMP=<scratch dir> MODE=floor|below node three-still.mjs'); process.exit(2); }
const THREE_PKG = JSON.parse(readFileSync(path.join(repo, 'node_modules/three/package.json'), 'utf8')).version;
if (THREE_PKG !== '0.170.0') { console.error(`three is ${THREE_PKG}, not the pinned 0.170.0`); process.exit(2); }
const threeSrc = readFileSync(path.join(repo, 'node_modules/three/build/three.module.min.js'), 'utf8');
const mitr = readFileSync(path.join(repo, 'public/fonts/mitr-semibold-subset.woff2')).toString('base64');
const FLOOR = KIT_VALUE('D1').floor;
const K = MODE === 'floor' ? 1.06 : 0.75;
const WORDS = ['ทุเรียน', 'ไข่เจียว', 'ข้าวเกรียบ'];
const RULE = 'มีรูปสระ “เ-ีย”';

const page = async (P) => {
  const bytes = Uint8Array.from(atob(P.mitr), (c) => c.charCodeAt(0));
  const face = new FontFace('Mitr', bytes, { weight: '600' }); document.fonts.add(face); await face.load();
  const THREE = await import(URL.createObjectURL(new Blob([P.three], { type: 'text/javascript' })));
  document.body.style.cssText = 'margin: 0; background: #14142b;';
  const W = 1920, H = 1080;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H); document.body.appendChild(renderer.domElement);
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const ctx = { webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext, live: !!gl && !gl.isContextLost(), renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#14142b');
  const cam = new THREE.PerspectiveCamera(40, W / H, 0.1, 100); cam.position.set(0, 0, 10);
  const halfH = 10 * Math.tan((20 * Math.PI) / 180); const pxPerUnit = H / (2 * halfH);
  // a texture drawn by the browser: the 2D canvas shapes the Thai, three only samples the pixels
  const tex = (text, cw, ch, fpx, bg, fg) => {
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, cw, ch); g.fillStyle = fg; g.font = `600 ${fpx}px Mitr`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, cw / 2, ch / 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
  };
  const TW = 1024, TH = 256, TF = 150;
  // the card height that puts the on-screen font at K x floor (untilted): font px = TF x (h x pxPerUnit / TH)
  const h = (P.floor * P.K * TH) / (TF * pxPerUnit); const w = h * (TW / TH);
  // tilted back only (no turn about the vertical): every glyph on a card scales alike, so its ink box compares like with like
  const cards = P.words.map((word, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex(word, TW, TH, TF, '#23214d', '#ffffff') }));
    m.position.set((i - 1) * 2.2, -0.6, 0); m.rotation.set(-0.35, 0, 0); scene.add(m); return { word, m };
  });
  // the drawn rule above them: a large white card, the condition label shaped by the browser (context, not measured)
  const rule = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: tex(P.rule, 1600, 400, 190, '#ffffff', '#14142b') }));
  rule.position.set(0, 1.6, -1); rule.rotation.set(-0.12, 0, 0); scene.add(rule);
  renderer.render(scene, cam);
  const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const ref = document.createElement('canvas').getContext('2d'); ref.font = `600 ${P.floor}px Mitr`;
  const out = cards.map(({ word, m }) => {
    m.updateMatrixWorld();
    const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => new THREE.Vector3(x, y, 0).applyMatrix4(m.matrixWorld).project(cam)).map((v) => [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]);
    const x0 = Math.ceil(Math.min(...pts.map((p) => p[0]))) + 2, x1 = Math.floor(Math.max(...pts.map((p) => p[0]))) - 2;
    const y0 = Math.ceil(Math.min(...pts.map((p) => p[1]))) + 2, y1 = Math.floor(Math.max(...pts.map((p) => p[1]))) - 2;
    let top = Infinity, bot = -Infinity;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = ((H - 1 - y) * W + x) * 4; if (0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2] > 128) { if (y < top) top = y; if (y > bot) bot = y; } }
    const mt = ref.measureText(word);
    return { word, box: [x0, y0, x1, y1], ink: bot >= top ? bot - top + 1 : 0, floorInk: +(mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent).toFixed(2) };
  });
  return { ctx, fontOk: document.fonts.check(`600 ${P.floor}px Mitr`), cards: out, cardPx: +(h * pxPerUnit).toFixed(2) };
};

const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const pend = new Map(); const errors = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text); };
await new Promise((r) => { ws.onopen = r; });
const send = (method, params = {}) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const P = { three: threeSrc, mitr, floor: FLOOR, K, words: WORDS, rule: RULE };
const res = await send('Runtime.evaluate', { expression: `(${page.toString()})(${JSON.stringify(P)})`, awaitPromise: true, returnByValue: true });
const v = res.result?.exceptionDetails ? null : res.result?.result?.value;
const problems = [];
if (!v || !v.ctx) problems.push(`page failed: ${JSON.stringify(res.result?.exceptionDetails ?? res).slice(0, 300)}`);
else {
  if (!v.ctx.live) problems.push('no live WebGL context in the page');
  if (!v.fontOk) problems.push('Mitr 600 did not load');
  for (const c of v.cards) if (!(c.ink >= c.floorInk)) problems.push(`3D glyph ink under the floor: ${c.word} renders ${c.ink}px of ink, the ${FLOOR}px floor draws ${c.floorInk}px`);
}
if (errors.length) problems.push(`console: ${errors.join(' | ')}`);
let shot = null;
if (v) {
  mkdirSync(SHOT_TMP, { recursive: true });
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 } });
  const png = path.join(SHOT_TMP, `gh325-three-${MODE}-${process.pid}.png`);
  writeFileSync(png, Buffer.from(s.result.data, 'base64'));
  shot = `Gh326PickRule-3d-${MODE === 'floor' ? 'floor' : 'below-floor'}.jpg`;
  execFileSync('magick', [png, '-strip', '-quality', '88', path.join(here, shot)]);
}
await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`); ws.close();
console.log(JSON.stringify({ mode: MODE, three: THREE_PKG, D1: `${KIT_OPT('D1')} ${FLOOR}px`, K, context: v?.ctx, cardPx: v?.cardPx, cards: v?.cards, shot, problems }, null, 1));
console.error(`${problems.length ? 'FAIL' : 'ok'} three-still ${MODE}: ${problems.length} problems`);
process.exitCode = problems.length ? 1 : 0;
