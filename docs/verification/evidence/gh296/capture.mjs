// gh#296: renders + column measurements of four tool boards (file://) and built pages (served dist/), at 1280 and 1440.
// Needs: headless Chrome on --remote-debugging-port=9371 (own --user-data-dir outside the repo) and `npx serve dist/ -l 4391`
// after `npm run build`. Run from repo root:  node docs/verification/evidence/gh296/capture.mjs
// Method per docs/agents/raw-cdp-capture.md: mobile:false, dsf 1, reduced motion, fonts.ready, scroll pass, JPEG q70,
// sliced with magick -crop when over 150KB.
import { writeFileSync, statSync, unlinkSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const OUT = 'docs/verification/evidence/gh296';
const PORT = 9371, SERVE = 4391, HEIGHT = 900, WIDTHS = [1280, 1440];
const TOOLS = ['wheel', 'number', 'draw', 'team'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const events = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else events.push(msg);
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, (msg) => (msg.error ? rej(new Error(method + ': ' + msg.error.message)) : res(msg.result)));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

// In-page measurement. kind = 'page' | 'board'.
const MEASURE = (kind) => `(()=>{
  const kind = ${JSON.stringify(kind)};
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + scrollX), w: Math.round(r.width * 10) / 10 }; };
  const sel = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : '') + (e.getAttribute('style') ? '[style="' + e.getAttribute('style').slice(0, 80) + '"]' : '');
  let area, block;
  if (kind === 'page') {
    block = [...document.querySelectorAll('main > div')].find((d) => !d.classList.contains('ad-slot'));
    area = block;                          // the page's column wrapper is the tool area
  } else {
    const top = [...document.querySelector('x-dc > div').children].filter((c) => !['SCRIPT','STYLE','LINK','HELMET'].includes(c.tagName));
    area = top.reduce((a, b) => (b.getBoundingClientRect().height > a.getBoundingClientRect().height ? b : a)); // tallest band = tool area
    block = area.firstElementChild;        // first block inside it = main content column
  }
  // Top-level blocks: board = children of the tool-area wrapper; page = children of the column wrapper.
  const kids = [...area.children].filter((c) => c.getBoundingClientRect().width > 0 && !['SCRIPT','STYLE'].includes(c.tagName));
  const xs = [...new Set(kids.map((k) => Math.round(k.getBoundingClientRect().left + scrollX)))];
  // Widest-block column: width of the main content block.
  const colEl = kind === 'page' ? block : block;
  // Nearest ancestor-or-self with a computed max-width cap (inclusive of the area), up to body.
  let cap = null;
  for (let e = colEl; e && e !== document.body; e = e.parentElement) {
    const mw = getComputedStyle(e).maxWidth;
    if (mw !== 'none') { cap = { selector: sel(e), computedMaxWidth: mw }; break; }
  }
  // First grid with >1 tracks inside the main block (internal two-column module, e.g. the number card).
  let grid = null;
  for (const e of [colEl, ...colEl.querySelectorAll('*')]) {
    const cs = getComputedStyle(e);
    if (cs.display === 'grid' && cs.gridTemplateColumns.split(' ').length > 1) { grid = { selector: sel(e), tracks: cs.gridTemplateColumns }; break; }
  }
  const de = document.documentElement;
  return { innerWidth, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, docHeight: Math.ceil(de.scrollHeight),
    toolArea: { selector: sel(area), ...R(area) },
    mainColumn: { selector: sel(colEl), ...R(colEl) },
    sideBySideColumns: xs.length, columnLeftXs: xs.sort((a,b)=>a-b),
    topLevelBlocks: kids.map((k) => ({ selector: sel(k).slice(0, 60), ...R(k) })),
    maxWidthCap: cap, firstInternalGrid: grid,
    imagesBroken: [...document.images].filter((i) => !i.complete || !i.naturalWidth).length };
})()`;

const jobs = [];
for (const t of TOOLS) for (const w of WIDTHS) {
  jobs.push({ kind: 'board', tool: t, width: w, url: 'file://' + resolve('design', `Tool${cap(t)}Desktop.dc.html`), base: `board-${t}-${w}` });
  jobs.push({ kind: 'page', tool: t, width: w, url: `http://127.0.0.1:${SERVE}/tool/${t}/`, base: `page-${t}-${w}` });
}
await send('Page.enable'); await send('Runtime.enable');
const results = [];
for (const j of jobs) {
  events.length = 0;
  await send('Emulation.setDeviceMetricsOverride', { width: j.width, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.navigate', { url: j.url });
  for (let t = 0; t < 100 && !events.some((e) => e.method === 'Page.loadEventFired'); t++) await new Promise((r) => setTimeout(r, 100));
  await evalJs(`(()=>{const s=document.createElement('style');s.textContent='*{animation:none!important;transition:none!important}';document.head.appendChild(s);return 1})()`);
  await evalJs('document.fonts.ready.then(()=>1)');
  await evalJs(`(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=300){scrollTo(0,y);await new Promise(r=>setTimeout(r,60))}scrollTo(0,0);return 1})()`);
  await new Promise((r) => setTimeout(r, 400));
  const m = await evalJs(MEASURE(j.kind));
  const fonts = await evalJs(`({mitr: document.fonts.check('600 19px Mitr'), notoThai: document.fonts.check('400 16px "Noto Sans Thai"')})`);
  const full = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: true, clip: { x: 0, y: 0, width: j.width, height: m.docHeight, scale: 1 } });
  const file = `${OUT}/${j.base}.jpg`; writeFileSync(file, Buffer.from(full.data, 'base64'));
  let files = [file]; const size = statSync(file).size;
  if (size > 150 * 1024) {
    const parts = Math.ceil(size / (130 * 1024));
    execFileSync('magick', [file, '-crop', `100%x${Math.ceil(100 / parts)}%`, '+repage', `${OUT}/${j.base}-part%d.jpg`]);
    unlinkSync(file);
    files = readdirSync(OUT).filter((f) => f.startsWith(j.base + '-part')).sort().map((f) => `${OUT}/${f}`);
  }
  const errors = events.filter((e) => e.method === 'Runtime.exceptionThrown').length;
  const rec = { name: j.base, kind: j.kind, tool: j.tool, requestedWidth: j.width, url: j.url, ...m, fonts, jsErrors: errors,
    files: files.map((f) => ({ f, bytes: statSync(f).size })) };
  results.push(rec);
  console.log(j.base, 'inner', m.innerWidth, 'cols', m.sideBySideColumns, 'col', m.mainColumn.w, 'sw/cw', m.scrollWidth, m.clientWidth, 'cap', m.maxWidthCap?.computedMaxWidth, files.length);
}
writeFileSync(`${OUT}/measurements.json`, JSON.stringify(results, null, 2) + '\n');
ws.close();
