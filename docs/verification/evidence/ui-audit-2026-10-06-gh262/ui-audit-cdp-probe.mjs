// gh#262 raw-CDP probe (standalone: node <this file>, env CDP_PORT BASE OUT). Needed because driver.mjs exposes no
// raw send(): CSS.getPlatformFontsForNode (the font actually painted, gh#261) and clipped screenshots
// (gh#257 canvas-vs-built crops) are CDP calls outside its session API.
//   run from the repo root (CANVAS defaults to design/HomeShelf320.dc.html relative to cwd)
//   CDP_PORT=9310 BASE=http://localhost:4410 OUT=<evidence dir> node ui-audit-cdp-probe.mjs
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const PORT = process.env.CDP_PORT || 9222, BASE = process.env.BASE || 'http://localhost:4410', OUT = process.env.OUT || '.';
const CANVAS = pathToFileURL(process.env.CANVAS || 'design/HomeShelf320.dc.html').href.replace('file:///', 'file:///');
const tgt = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl); let id = 0; const pend = new Map(); let loadRes = null;
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) pend.get(m.id)(m); if (m.method === 'Page.loadEventFired' && loadRes) { loadRes(); loadRes = null; } });
await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Page.enable'); await send('DOM.enable'); await send('CSS.enable'); await send('Runtime.enable');
const nav = async (u) => { const p = new Promise((r) => { loadRes = r; }); await send('Page.navigate', { url: u }); await p; await sleep(1500); };
const width = async (w) => { await send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 640 ? 640 : 900, deviceScaleFactor: 1, mobile: w < 640 }); await sleep(300); };
const ev = async (body) => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? { error: JSON.stringify(r.result?.exceptionDetails ?? r.error) }; };
const fontsFor = async (sel) => {
  const doc = await send('DOM.getDocument', { depth: 0 });
  const q = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: sel });
  if (!q.result?.nodeId) return { error: 'no node ' + sel };
  const f = await send('CSS.getPlatformFontsForNode', { nodeId: q.result.nodeId });
  return f.result?.fonts?.map((x) => `${x.familyName} / ${x.postScriptName} (${x.glyphCount} glyphs, custom=${x.isCustomFont})`) ?? { error: JSON.stringify(f) };
};
// Line-break meter shared by built and canvas: per element, line pitch from per-character rects and every
// Thai dictionary word (Intl.Segmenter) whose characters land on two different lines.
const METER = `
  const seg = new Intl.Segmenter('th', { granularity: 'word' });
  window.__meter = (el) => {
    const cs = getComputedStyle(el); const tn = [...el.childNodes].filter((n) => n.nodeType === 3 && n.data.trim());
    const tops = []; const split = []; const lineText = {};
    for (const n of tn) {
      for (const s of seg.segment(n.data)) {
        const lt = [];
        for (let i = s.index; i < s.index + s.segment.length; i++) { const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 1); const r = [...rg.getClientRects()].find((x) => x.width > 0); if (r) lt.push(Math.round(r.top)); }
        lt.forEach((t) => tops.push(t)); { let k = 0; for (let i = s.index; i < s.index + s.segment.length; i++) { const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 1); const r = [...rg.getClientRects()].find((x) => x.width > 0); if (r) (lineText[Math.round(r.top)] ||= []).push(n.data[i]); } }
        if (s.isWordLike && s.segment.length > 1 && new Set(lt.map((t) => Math.round(t / 4))).size > 1) split.push(s.segment);
      }
    }
    const lines = [...new Set(tops)].sort((a, b) => a - b); const pitches = lines.slice(1).map((t, i) => t - lines[i]);
    const r = el.getBoundingClientRect();
    return { text: el.textContent.trim().slice(0, 60), fontSize: cs.fontSize, lineHeightComputed: cs.lineHeight, overflowWrap: cs.overflowWrap, wordBreak: cs.wordBreak, family: cs.fontFamily.slice(0, 40), boxW: Math.round(r.width), boxH: +r.height.toFixed(1), lines: lines.length, linePitchPx: pitches, boxHPerLine: +(r.height / Math.max(lines.length, 1)).toFixed(2), midWordSplits: split, lineTexts: Object.keys(lineText).map(Number).sort((a, b) => a - b).map((k) => lineText[k].join('')) };
  };`;
const out = { generatedFor: 'gh#262', base: BASE };

// --- gh#261 fonts (h1 painted font), 320 + 1440, with draw/siamsi as the Mitr control
out.platformFonts = {};
for (const w of [320, 1440]) {
  await width(w);
  for (const p of ['/tool/wheel/', '/tool/number/', '/tool/draw/']) {
    await nav(BASE + p);
    out.platformFonts[`${p}@${w}`] = { h1Computed: await ev(`return getComputedStyle(document.querySelector('h1')).fontFamily + ' | ' + getComputedStyle(document.querySelector('h1')).fontWeight`), h1Painted: await fontsFor('h1') };
  }
}
// --- gh#257 / gh#258: built home (fortune + tool tile bodies), then canvas D
const builtSel = `[...document.querySelectorAll('.tile .desc')].filter((e) => e.getBoundingClientRect().width > 0)`;
out.built = {}; out.canvas = {};
for (const w of [320, 1440]) {
  await width(w); await nav(BASE + '/');
  await ev(METER);
  out.built[w] = await ev(`const els = ${builtSel}; return els.map((e) => ({ tile: e.closest('a').getAttribute('href'), ...window.__meter(e) }));`);
  // control: a known mid-word break (overflow-wrap:anywhere in a 40px box) — the meter must report it
  out.built[w + 'Control'] = await ev(`const d = document.createElement('div'); d.style.cssText = 'width:40px;overflow-wrap:anywhere;font-size:16px;position:absolute;top:0;left:0'; d.textContent = 'เครื่องมือกิจกรรมสันทนาการ'; document.body.appendChild(d); const r = window.__meter(d); d.remove(); return r;`);
  // screenshot clip of the fortune section (built)
  const box = await ev(`const a = document.querySelector('a.tile[href="/game/siamsi/"]'); a.scrollIntoView({block:'center'}); await new Promise(r=>setTimeout(r,300)); const g = a.closest('section') || a.parentElement; const r = g.getBoundingClientRect(); return { x: 0, y: r.top + scrollY, width: innerWidth, height: Math.min(r.height, 700) };`);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...box, scale: 1 } });
  await writeFile(`${OUT}/crop-built-fortune-${w}.png`, Buffer.from(shot.result.data, 'base64'));
}
await width(320); await nav(CANVAS);
await ev(METER);
out.canvasFonts = await ev(`return { loaded: [...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family+' '+f.weight), innerWidth, tiles: document.querySelectorAll('.shelf-tile').length }`);
out.canvas[320] = await ev(`const els = ['/game/siamsi/','/game/daily-fortune/','/game/love-match/'].map((h) => document.querySelector('a[href="'+h+'"]').querySelectorAll('span')[1]); return els.map((e) => ({ tile: e.closest('a').getAttribute('href'), ...window.__meter(e) }));`);
out.canvas.popularDescs320 = await ev(`return [...document.querySelectorAll('a.shelf-tile[style*="grid-template-columns"]')].map((a) => ({ tile: a.getAttribute('href'), ...window.__meter(a.querySelectorAll(':scope > span:last-child > span')[1]) }));`);
out.canvas.overflowWrapAnywhere = await ev(`return [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).overflowWrap === 'anywhere' && e.getBoundingClientRect().width > 0).map((e) => e.tagName.toLowerCase() + ' "' + e.textContent.trim().slice(0, 40) + '" inline=' + (e.getAttribute('style') || '').includes('overflow-wrap') + ' font=' + getComputedStyle(e).fontSize);`);
const cbox = await ev(`const a = document.querySelector('a[href="/game/siamsi/"]'); a.scrollIntoView({block:'center'}); await new Promise(r=>setTimeout(r,300)); const g = a.parentElement.parentElement; const r = g.getBoundingClientRect(); return { x: 0, y: r.top + scrollY, width: innerWidth, height: Math.min(r.height, 700) };`);
const cshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...cbox, scale: 1 } });
await writeFile(`${OUT}/crop-canvas-fortune-320.png`, Buffer.from(cshot.result.data, 'base64'));
await fetch(`http://127.0.0.1:${PORT}/json/close/${tgt.id}`); ws.close();
await writeFile(`${OUT}/audit-cdp.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1).slice(0, 14000));
process.exit(0);
