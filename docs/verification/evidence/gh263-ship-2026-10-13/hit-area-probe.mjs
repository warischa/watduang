// gh#263 ship 2026-10-13: measured tappable height of pseudo-element hit areas (chrome pill/brand, siamsi chip), GameNav link control,
// a must-red that switches the ::after off in-page, and game-topbar overflow at 320. Args: <out.json> <serve> <cdp>
import { writeFileSync } from 'node:fs';
const [OUT, SERVE = '4461', CDP = '9361'] = process.argv.slice(2);
const base = `http://127.0.0.1:${SERVE}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const target = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const events = [];
ws.addEventListener('message', (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else events.push(msg); });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (msg) => (msg.error ? rej(new Error(method + ': ' + msg.error.message)) : res(msg.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
await send('Page.enable'); await send('Runtime.enable');
async function nav(url, width, mobile) { events.length = 0; await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile }); await send('Page.navigate', { url }); for (let t = 0; t < 100 && !events.some((e) => e.method === 'Page.loadEventFired'); t++) await wait(100); await ev('document.fonts.ready.then(() => 1)'); await wait(600); }
// Vertical scan at the element's centre x and at x inset 3px from each side, 0.5px steps, 10px beyond the box:
// tappable = (#points whose hit is the element or a descendant) * 0.5. Min over the three columns is reported.
const scan = (sel) => ev(`(() => { window.scrollTo(0, 0); return [...document.querySelectorAll(${JSON.stringify(sel)})].map((el) => {
  el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect();
  const cols = [r.left + r.width / 2, r.left + 3, r.right - 3]; let min = Infinity, stolen = 0;
  for (const x of cols) { let n = 0; for (let y = r.top - 10; y <= r.bottom + 10; y += 0.5) { const h = document.elementFromPoint(x, y); if (h && (h === el || el.contains(h))) n++; else if (h && y >= r.top - 5 && y <= r.bottom + 5 && h.closest('a,button') && !el.contains(h)) stolen++; } min = Math.min(min, n * 0.5); }
  return { t: el.textContent.trim().slice(0, 14), boxH: Math.round(r.height * 10) / 10, tappable: min, stolenSamples: stolen }; }); })()`);
const killAfter = (sel) => ev(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(sel)} + '::after{display:none !important}'; document.head.append(s); return 1; })()`);
const out = { builtAt: new Date().toISOString(), runs: [] };
for (const [width, mobile] of [[320, true], [1440, false]]) {
  for (const path of ['/', '/c/fortune/', '/tools/']) {
    await nav(base + path, width, mobile);
    out.runs.push({ path, width, sel: '.chrome-brand', r: await scan('.chrome-brand') });
    out.runs.push({ path, width, sel: '.chrome-pill', r: await scan('.chrome-pill') });
    if (path === '/' && width === 320) { await killAfter('.chrome-pill'); out.runs.push({ path, width, sel: '.chrome-pill MUST-RED (::after off)', r: await scan('.chrome-pill') }); }
  }
  await nav(base + '/tool/wheel/', width, mobile);
  out.runs.push({ path: '/tool/wheel/', width, sel: 'GameNav a (control)', r: (await scan('nav.wheel-next a')).slice(0, 3) });
  await nav(base + '/game/siamsi/', width, mobile);
  out.runs.push({ path: '/game/siamsi/', width, sel: '.sm-chip', r: await scan('.sm-chip') });
  if (width === 320) { await killAfter('.sm-chip'); out.runs.push({ path: '/game/siamsi/', width, sel: '.sm-chip MUST-RED (::after off)', r: await scan('.sm-chip') }); }
  for (const path of ['/game/siamsi/', '/game/love-match/', '/game/daily-fortune/']) {
    await nav(base + path, width, mobile);
    out.runs.push({ path, width, sel: 'topbar', r: await ev(`(() => { const t = document.querySelector('.game-topbar'); const r = t.getBoundingClientRect(); const de = document.documentElement;
      return { topbarH: Math.round(r.height * 10) / 10, topbarScroll: t.scrollWidth, topbarClient: t.clientWidth, docScroll: de.scrollWidth, docClient: de.clientWidth, innerWidth,
        links: [...t.querySelectorAll('a')].map((a) => { const b = a.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right) }; }) }; })()`) });
  }
}
out.exceptions = events.filter((e) => e.method === 'Runtime.exceptionThrown').length;
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
for (const x of out.runs) console.log(x.width, x.path, x.sel, JSON.stringify(x.r));
console.log('exceptions', out.exceptions);
await fetch(`http://127.0.0.1:${CDP}/json/close/${target.id}`); ws.close();
