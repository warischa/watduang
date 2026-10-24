// gh#288 Phase 0 — focus, hover, active and disabled states (gh#262 "Not covered" item 2).
// Keyboard: real Tab key events (Input.dispatchKeyEvent), never element.focus() — script focus does not
// set :focus-visible the way a key does. Hover/active: real mouse events, computed style diffed against
// the same element with the mouse parked at (1,1). Every detector has an in-page must-red injected first:
//   focus  — a <button style="outline:none;box-shadow:none"> must read ringVisible=false, and a
//            <button style="outline:3px solid red"> must read true;
//   hover  — an element with a :hover background rule must read a delta, its twin without one must not.
// Read-only on the site: injected controls are removed before the page's own elements are walked.
//
//   CDP_PORT=9310 W=1440 H=900 MOBILE=0 OUT=<json> node <this file>
import { open } from './cdp-lib.mjs';
import { writeFile } from 'node:fs/promises';

const BASE = process.env.BASE || 'http://localhost:4410';
const W = Number(process.env.W || 1440), H = Number(process.env.H || 900);
const MOBILE = process.env.MOBILE ? process.env.MOBILE === '1' : W < 640;
const PAGES = (process.env.PAGES || '/,/tools/,/tool/wheel/,/tool/draw/,/tool/team/,/tool/number/,/c/fortune/,/c/party/,/game/siamsi/,/game/daily-fortune/,/game/love-match/,/404.html').split(',');
const HOVER = process.env.HOVER !== '0';

const HELPERS = `
  window.__h = {
    parse(s) { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; },
    lum(c) { const v = c.slice(0, 3).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; },
    bg(el) { const layers = []; for (let e = el; e; e = e.parentElement) { const c = __h.parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } } let base = [255, 255, 255]; for (const l of layers.reverse()) base = [0, 1, 2].map((i) => l[i] * l[3] + base[i] * (1 - l[3])); return base; },
    ratio(a, b) { const x = __h.lum(a), y = __h.lum(b); return +((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2); },
    label(el) { return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').filter((c) => c && !c.startsWith('astro-')).slice(0, 2).join('.') : '') + ' "' + (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 22) + '"'; },
    ring(el) {
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      const ow = parseFloat(cs.outlineWidth) || 0; const outline = cs.outlineStyle !== 'none' && ow > 0;
      const shadow = cs.boxShadow !== 'none';
      const oc = __h.parse(cs.outlineColor);
      const behind = __h.bg(el.parentElement || el);
      return { el: __h.label(el), fv: el.matches(':focus-visible'), ringVisible: outline || shadow, outline: outline ? cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor + ' off ' + cs.outlineOffset : null, boxShadow: shadow ? cs.boxShadow.slice(0, 80) : null, ringContrast: outline && oc ? __h.ratio(oc, behind) : null, y: Math.round(r.top + scrollY), x: Math.round(r.left) };
    },
    STYLE_KEYS: ['backgroundColor', 'color', 'transform', 'boxShadow', 'borderTopColor', 'textDecorationLine', 'filter', 'opacity', 'outlineStyle', 'translate', 'scale'],
    snap(el) { const cs = getComputedStyle(el); const o = {}; for (const k of __h.STYLE_KEYS) o[k] = cs[k]; return o; },
    diff(a, b) { return __h.STYLE_KEYS.filter((k) => a[k] !== b[k]).map((k) => k + ': ' + String(a[k]).slice(0, 40) + ' -> ' + String(b[k]).slice(0, 40)); },
  };
  return 1;
`;

const s = await open();
await s.setWidth(W, H, MOBILE);
await s.reducedMotion(false);
const out = { width: W, height: H, mobile: MOBILE, pages: [], calibration: {} };

async function tabWalk(max = 70) {
  await s.ev(`document.activeElement?.blur(); scrollTo(0, 0); return 1`);
  const stops = []; const seen = new Set();
  for (let i = 0; i < max; i++) {
    await s.tab(); await s.sleep(60);
    const r = await s.ev(`const a = document.activeElement; if (!a || a === document.body) return null; return __h.ring(a);`);
    if (!r) { stops.push({ el: '(body)' }); break; }
    const key = r.el + '@' + r.y + ',' + r.x;
    if (seen.has(key)) break;
    seen.add(key); stops.push(r);
  }
  return stops;
}

// ---- calibration (once, on /) ----
await s.nav(BASE + '/');
await s.ev(HELPERS);
await s.ev(`const st = document.createElement('style'); st.id = '__cal'; st.textContent = '#__hov:hover{background:rgb(255,0,0)!important}'; document.head.appendChild(st);
  const mk = (id, css) => { const b = document.createElement('button'); b.id = id; b.textContent = id; b.style.cssText = 'position:fixed;left:4px;width:80px;height:40px;z-index:99999;' + css; document.body.prepend(b); return b; };
  mk('__noring', 'top:4px;outline:none!important;box-shadow:none!important'); mk('__ring', 'top:50px;outline:3px solid red!important;');
  mk('__hov', 'top:100px;background:rgb(0,0,255)'); mk('__nohov', 'top:150px;background:rgb(0,0,255)');
  document.querySelector('#__ring').addEventListener('focus', () => {}); return 1;`);
await s.ev(`document.querySelector('#__ring').before(document.querySelector('#__noring')); return 1`);
await s.ev(`document.activeElement?.blur(); return 1`);
const calStops = [];
for (let i = 0; i < 4; i++) { await s.tab(); await s.sleep(60); calStops.push(await s.ev(`return __h.ring(document.activeElement)`)); }
out.calibration.focus = calStops;
const hov = async (id) => { const c = await s.ev(`const r = document.querySelector('#${id}').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`); await s.mouse('mouseMoved', 1, 1); await s.sleep(80); const a = await s.ev(`return __h.snap(document.querySelector('#${id}'))`); await s.mouse('mouseMoved', c.x, c.y); await s.sleep(250); const b = await s.ev(`return __h.snap(document.querySelector('#${id}'))`); return await s.ev(`return __h.diff(${JSON.stringify(a)}, ${JSON.stringify(b)})`); };
out.calibration.hoverWithRule = await hov('__hov');
out.calibration.hoverWithoutRule = await hov('__nohov');

for (const p of PAGES) {
  await s.nav(BASE + p);
  await s.ev(HELPERS);
  await s.sleep(800); // arm windows (ADR-0057) settle before anything is read
  const page = { path: p };
  page.tab = await tabWalk();
  // Visual order check: a stop that lands more than 40px ABOVE the previous one (same page, no wrap).
  page.tabBackJumps = page.tab.filter((t, i) => i > 0 && t.y !== undefined && page.tab[i - 1].y !== undefined && t.y < page.tab[i - 1].y - 40).map((t) => t.el);
  page.tabNoRing = page.tab.filter((t) => t.ringVisible === false).map((t) => t.el);
  page.tabNotFocusVisible = page.tab.filter((t) => t.fv === false).map((t) => t.el);
  page.ringStyles = [...new Set(page.tab.filter((t) => t.ringVisible).map((t) => (t.outline || '') + ' | ' + (t.boxShadow || '')))];
  page.ringLowContrast = page.tab.filter((t) => t.ringContrast !== null && t.ringContrast < 3).map((t) => t.el + ' ' + t.ringContrast);
  page.disabled = await s.ev(`return [...document.querySelectorAll('button:disabled, input:disabled, select:disabled, textarea:disabled')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const cs = getComputedStyle(e); return { el: __h.label(e), bg: cs.backgroundColor, color: cs.color, opacity: cs.opacity, cursor: cs.cursor, border: cs.borderTopColor }; });`);
  if (HOVER) {
    // Two instances per component signature (tag + first class), interactive elements only.
    const targets = await s.ev(`const sig = {}; const els = [...document.querySelectorAll('a[href], button, input, select, textarea, label, summary, [role=button]')].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden'; }).filter((e) => { const k = e.tagName + '.' + (typeof e.className === 'string' ? e.className.split(' ').filter((c) => c && !c.startsWith('astro-'))[0] || '' : ''); sig[k] = (sig[k] || 0) + 1; return sig[k] <= 2; }); window.__targets = els; return els.length;`);
    const hover = [], active = [];
    for (let i = 0; i < targets; i++) {
      const c = await s.ev(`const e = window.__targets[${i}]; e.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 60)); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: __h.label(e), hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === e || e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };`);
      if (!c.hit) { hover.push({ el: c.label, skipped: 'covered at centre' }); continue; }
      await s.mouse('mouseMoved', 1, 1); await s.sleep(60);
      const a = await s.ev(`return __h.snap(window.__targets[${i}])`);
      await s.mouse('mouseMoved', c.x, c.y); await s.sleep(250);
      const b = await s.ev(`return __h.snap(window.__targets[${i}])`);
      hover.push({ el: c.label, delta: await s.ev(`return __h.diff(${JSON.stringify(a)}, ${JSON.stringify(b)})`) });
      // Active: press, read, then leave and release elsewhere so no click lands on the control.
      await s.mouse('mousePressed', c.x, c.y, 1); await s.sleep(120);
      const d = await s.ev(`return __h.snap(window.__targets[${i}])`);
      await s.mouse('mouseMoved', 1, 1); await s.mouse('mouseReleased', 1, 1); await s.sleep(60);
      active.push({ el: c.label, delta: await s.ev(`return __h.diff(${JSON.stringify(b)}, ${JSON.stringify(d)})`) });
      const moved = await s.ev(`return location.pathname`);
      if (moved !== new URL(BASE + p).pathname && !(p === '/404.html')) { hover.push({ el: c.label, navigatedTo: moved }); await s.nav(BASE + p); await s.ev(HELPERS); await s.ev(`window.__targets = null; return 1`); break; }
    }
    page.hover = hover; page.active = active;
    page.hoverWithDelta = hover.filter((h) => h.delta?.length).length; page.hoverSampled = hover.filter((h) => h.delta).length;
    page.activeWithDelta = active.filter((h) => h.delta?.length).length;
  }
  out.pages.push(page);
}
out.consoleErrors = s.events;
await s.close();
if (process.env.OUT) await writeFile(process.env.OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ cal: out.calibration, pages: out.pages.map((p) => ({ path: p.path, stops: p.tab.length, noRing: p.tabNoRing.length, notFV: p.tabNotFocusVisible.length, back: p.tabBackJumps.length, lowC: p.ringLowContrast.length, dis: p.disabled.length, hov: p.hoverWithDelta + '/' + p.hoverSampled, act: p.activeWithDelta })), events: s.events.length }));
process.exit(0);
