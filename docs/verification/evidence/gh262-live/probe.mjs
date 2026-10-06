// gh#262 AC box 4 on the live site, raw CDP (recipe: docs/agents/raw-cdp-capture.md). Run from repo root:
//   node docs/verification/evidence/gh262-live/probe.mjs   (headless Chrome already on --remote-debugging-port=9361)
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const OUT = 'docs/verification/evidence/gh262-live';
const BASE = 'https://white-plant-05ad7c600.7.azurestaticapps.net';
const PAGES = ['/', '/tool/number/', '/tool/wheel/', '/tool/draw/', '/tool/team/', '/404.html', '/c/fortune/', '/c/party/'];
const WIDTHS = [320, 1440];
const targets = await (await fetch('http://127.0.0.1:9361/json/list')).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const events = [];
ws.addEventListener('message', (m) => { const g = JSON.parse(m.data); if (g.id && pending.has(g.id)) { pending.get(g.id)(g); pending.delete(g.id); } else events.push(g); });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (g) => (g.error ? rej(new Error(method + ': ' + g.error.message)) : res(g.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result.value;
await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable'); await send('CSS.enable');

const PROBE = `(() => {
  const cs = (e) => getComputedStyle(e);
  const box = (e) => { const r = e.getBoundingClientRect(); return { w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
  const out = {};
  const de = document.documentElement;
  out.innerWidth = innerWidth; out.scrollWidth = de.scrollWidth; out.clientWidth = de.clientWidth;
  out.badImages = [...document.images].filter((i) => !i.complete || !i.naturalWidth).length;
  const h1 = document.querySelector('h1');
  if (h1) out.h1 = { size: cs(h1).fontSize, weight: cs(h1).fontWeight, text: h1.textContent.trim().slice(0, 30) };
  out.bodyBg = cs(document.body).backgroundColor;
  out.htmlBg = cs(de).backgroundColor;
  const q = (s) => document.querySelector(s);
  const ctrl = [...document.querySelectorAll('input[type=radio],input[type=checkbox]')].map((e) => ({ type: e.type, id: e.id, ...box(e) }));
  out.controls = ctrl;
  const btn = (s) => { const e = q(s); return e ? box(e).h : null; };
  const slot = (s) => { const e = q(s); if (!e) return null; const c = cs(e); return { ...box(e), borderStyle: c.borderTopStyle, borderWidth: c.borderTopWidth, bg: c.backgroundColor }; };
  const p = location.pathname;
  if (p === '/') {
    out.desc = [...document.querySelectorAll('.desc')].map((e) => {
      const c = cs(e); const fs = parseFloat(c.fontSize);
      const rng = document.createRange(); rng.selectNodeContents(e);
      const tops = [...new Set([...rng.getClientRects()].map((r) => Math.round(r.top)))].sort((a, b) => a - b);
      const lines = tops.length;
      return { fs, lh: c.lineHeight, lhPx: parseFloat(c.lineHeight), rectH: box(e).h, lines, pitch: lines >= 2 ? (tops[tops.length - 1] - tops[0]) / (lines - 1) : (lines === 1 ? null : null), pitchByH: box(e).h / Math.max(lines, 1) };
    });
    const m = q('.mark'); const mc = cs(m);
    out.mark = { text: m.textContent.trim(), color: mc.color, bg: mc.backgroundColor, border: mc.borderTopWidth + ' ' + mc.borderTopStyle + ' ' + mc.borderTopColor, display: mc.display, radius: mc.borderRadius };
    const ad = q('.ad-slot'); out.ad = { text: ad.textContent.trim().slice(0, 20), color: cs(ad).color };
    // The label may sit on a child element; report the text-bearing node's own color too.
    const w = document.createTreeWalker(ad, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.textContent.includes('ช่องโฆษณา')) { out.ad.textNodeParentColor = cs(n.parentElement).color; out.ad.parentTag = n.parentElement.tagName + '.' + n.parentElement.className; break; }
  }
  if (p === '/tool/draw/' || p === '/tool/team/') { const e = q('.tool-eyebrow'); const c = cs(e); out.eyebrow = { color: c.color, bg: c.backgroundColor, display: c.display }; }
  if (p === '/tool/wheel/') out.result = slot('#wheel-result');
  if (p === '/tool/number/') { out.result = slot('#number-result'); out.go = btn('#number-go'); out.reset = btn('#number-reset'); }
  if (p === '/404.html') {
    const a = [...document.querySelectorAll('a')].find((x) => x.textContent.includes('กลับหน้าแรก')); const c = cs(a);
    out.pill = { ...box(a), color: c.color, bg: c.backgroundColor, radius: c.borderRadius };
  }
  if (p.startsWith('/c/')) out.kickers = [...document.querySelectorAll('h2.kicker')].map((e) => cs(e).fontSize);
  return out;
})()`;

const results = [];
for (const path of PAGES) for (const width of WIDTHS) {
  events.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.navigate', { url: BASE + path });
  for (let t = 0; t < 200 && !events.some((e) => e.method === 'Page.loadEventFired'); t++) await new Promise((r) => setTimeout(r, 100));
  await ev(`(()=>{const s=document.createElement('style');s.textContent='*{animation:none!important;transition:none!important}';document.head.appendChild(s);return 1})()`);
  await ev('document.fonts.ready.then(()=>1)');
  await ev(`(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=300){scrollTo(0,y);await new Promise(r=>setTimeout(r,60))}scrollTo(0,0);await new Promise(r=>setTimeout(r,400));return 1})()`);
  const m = await ev(PROBE);
  m.reducedMotion = await ev(`matchMedia('(prefers-reduced-motion: reduce)').matches`);
  m.pathname = await ev('location.pathname');
  const doc = await send('DOM.getDocument', { depth: -1 });
  const qn = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'h1' });
  if (qn.nodeId) m.h1Font = (await send('CSS.getPlatformFontsForNode', { nodeId: qn.nodeId })).fonts.map((f) => `${f.postScriptName || f.familyName} x${f.glyphCount}`).join(', ');
  const height = await ev('Math.ceil(document.documentElement.scrollHeight)');
  const base = `${OUT}/${(path === '/' ? 'home' : path.replace(/^\/|\/$|\.html$/g, '').replace(/\//g, '-'))}-${width}`;
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
  const buf = Buffer.from(shot.data, 'base64');
  const files = [];
  if (buf.length < 150000) { writeFileSync(base + '.jpg', buf); files.push(base + '.jpg'); }
  else { writeFileSync(base + '.jpg', buf); execFileSync('magick', [base + '.jpg', '-crop', '100%x50%', '+repage', base + '-part%d.jpg']); execFileSync('rm', [base + '.jpg']); for (const i of [0, 1]) files.push(`${base}-part${i}.jpg`); }
  results.push({ path, width, height, ...m, files });
  console.log(path, width, 'iw=' + m.innerWidth, 'sw/cw=' + m.scrollWidth + '/' + m.clientWidth, 'bytes=' + buf.length);
}
writeFileSync(`${OUT}/probe-result.json`, JSON.stringify(results, null, 2) + '\n');
ws.close();
