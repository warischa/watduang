#!/usr/bin/env node
// gh#268 box 3 -- THE PLAY TOP BAND, asserted by outcome in a real browser.
//
// THE INVARIANT, one sentence: on every manifest play route, at 320x568 and on every screen this walk
// reaches, the close X and the edit-players control both lie inside the reserved top band (56px tall,
// full width, ground #14142b, owner ruling 2026-10-20, board design/PlayTopBand.dc.html), and no
// visible box of route content intersects that band.
//
// ONE CARVE-OUT (owner ruling 2026-11-13, gh#314 1a B, overriding gh#268's no-content band for one element):
// on the prize-draw play route only, the MC control (MC_SEL, the projector's reveal button) may sit inside
// the band. In its place the probe asserts that the control's whole box -- its root, every descendant, and
// every ::before/::after of them, since a pseudo-element is how a hit area grows past the pill -- never
// intersects the close X or the edit control (forced read included) on any screen or width it reads, and
// stays fully inside the viewport. The exemption is by route AND element: the same control in the band on
// any other route reds, and every other prize-draw box in the band (or anchored above it) still reds.
// Proven without a browser on the verdict: play-top-band-probe.test.mjs.
//
// A SECOND CARVE-OUT (owner ruling 2026-11-14, "carve-out for .pr-bar like .pd-mc"; the placement is the owner
// pick gh#305 PD-305-02, the demo bar at the band's right end): on the three prize reveal demo routes only
// (DEMO_ROUTES), the demo bar (BAR_SEL) may be anchored fixed above the band, and ONLY while the viewport
// that holds it (BAR_VIEWPORT_SEL) carries data-bar="band". The exemption is by route AND by the bar element
// itself, not its descendants. Each exempted bar is then judged on that row: it shows a box, that box (root,
// descendants, ::before/::after, the same union the MC read takes) lies inside the band, clears the close X
// and the edit control, sits on one row (every item and every text line it holds crosses one horizontal
// line), and is built from geometry the read is exact for; at most one bar is admitted per screen. A bar
// anchored above with any other data-bar, a bar on any other route, and every other fixed/sticky box above
// the band on a demo route still red. Route content intersecting the band is NOT covered by this carve-out.
//
//   npm run build && npx serve dist/ -l <port>
//   Chrome --headless --remote-debugging-port=<cdp> --user-data-dir=<fresh>
//   BASE=http://localhost:<port> CDP_PORT=<cdp> node scripts/play-top-band-probe.mjs
//
// Exit 0 only on a green; every failure is printed as `::error::` and the full measurement goes to
// BAND_OUT (a JSON path) when set. Run as `node scripts/driver.mjs <this file>` it prints the raw
// measurement instead and judges nothing -- the entry point below is the gate.
//
// THE ROUTE SET is the manifest's: every game with a playRoute, the same expression the other play
// probes use. An empty set throws, so a manifest that lost its routes cannot read as a pass.
//
// ROUTE CONTENT is every element under <body> EXCEPT a closed set this file owns: the band and the
// three elements src/shell/PlayExit.astro renders (CHROME_IDS), plus non-rendering tags. Inverted on
// purpose -- a set the page could extend (a marker attribute) would let any element exempt itself,
// and an element a script appends straight to <body> is route content like any other. Excluded by
// SIZE, and named in the JSON as `skippedTiny`: boxes 1px or less on either axis, which is the
// visually-hidden live-region idiom every route uses (a 1px clipped box carries no ink). A box counts
// once it has area, computed visibility, and an effective (ancestor-multiplied) opacity above 0.01;
// it is clipped by every ancestor whose overflow is not visible, and by its own and its ancestors'
// clip-path inset(), before the band test, so ink that cannot reach the band is not reported.
//
// SCREENS THE WALK NEVER OPENS (a closed modal, a toast, a sticky header after a scroll) are covered
// by their declared anchor instead of their box: every fixed or sticky route element, shown or not,
// whose computed `top` (plus its own clip-path inset) is above the band's bottom is reported in
// `anchoredAbove` and reds -- body padding cannot move such a box, so it WILL land in the band when it
// shows. Not reported: a box inside a transformed/contained ancestor (that ancestor is its containing
// block, and padding moves it), a sticky box inside its own scroller, and a box an !important
// `display: none` pins shut (an inline display that does not take is that pin).
//
// THE SCREENS. S1: storage wiped, the screen a first-time device opens on (the shared player screen
// is open there, so the edit control is hidden by design). S2: a three-name roster seeded, the
// route's own pre-setup control pressed where its first screen is a menu, then the shared screen's
// start -- the edit control is shown from here. S3: the route's own round-start control, where it
// has one, i.e. the in-round header box 1 measured worst. The per-route selectors below were probed
// for box 1; a declared selector that is ABSENT reds the row, so a stale map is loud, never a
// silently shorter walk. Plus D1: S1 at a desktop viewport -- the ruling holds the band at the same
// height at every width. The MC route adds D2: its seeded screen at the desktop width, because its
// fresh-device screens (S1, D1) hold no event and so show no MC control to check.
//
// STATE THAT OUTLIVES THE WIPE. The prize-draw event lives in IndexedDB, which the localStorage wipe
// does not touch: one run's pressed event then greets the next run's S1, and the next seed diverges from
// it, so the MC control vanishes and the walk reads a different page every run. The walk deletes that
// database wherever it wipes, so every run starts from the same empty store.
//
// EVERY TRANSITION IS ASSERTED, not assumed. A press that returns anything but 'clicked' (hidden,
// disabled, absent) reds the row. After the S2 start and the S3 round start the page must read
// data-player-screen "closed", data-render-hold "free" and a data-player-screen-handover count of 1 or
// more, and S3 must show a different page than S2 did; the red names which of these failed.
//
// PAINTED, NOT JUST PLACED. The band and both controls are also read for computed visibility and for
// effective opacity (own times every ancestor's). An enabled control must reach 1, a disabled one the
// chrome's own dimmed level, the band 1; a box at opacity 0 has a position and a size and paints nothing.
//
// THE EDIT CONTROL'S BOX. Where it is hidden on every screen a route reaches, its box is read with
// `hidden` lifted for one synchronous read and restored, and the row says `pillForced: true`. Its
// position is viewport-fixed and route-independent, so the forced read is the same box a shown
// control occupies -- but it is reported, so the pill assertion never goes vacuous unannounced.
//
// CALIBRATION. BREAK_BAND=1 is the control leg: it kills the reserve on every route (body padding and
// the --play-band property both back to 0) before any page script runs, walks S1 at 320 only, and the
// leg passes ONLY if every route then reds on content, with exactly one row per route. BAND_HOSTILE_CSS=<css> plants an arbitrary stylesheet the same way and is judged as a
// normal leg (manual calibration: pull one route's header up, expect exactly that route to red).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { games } from '../src/games/manifest.ts';
// gh#304: a route whose category has no shared player screen (the company-party event) is walked with
// its own seed and its own round-start control, and is judged on what it IS: no shared screen mounted,
// and a round start that changes the page. The set and the seed are the fit probe's, one definition.
import { routeSeed, screenlessPlayPaths } from './play-screen-fit-probe.mjs';
import { DB as PRIZE_DB } from '../src/prize-event/store.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const BASE = process.env.BASE || 'http://localhost:4631';
const CDP_PORT = process.env.CDP_PORT || '9331';
const BREAK_BAND = Boolean(process.env.BREAK_BAND);
// The control zeroes the band's custom property as well as the body padding: a route that re-anchors a
// fixed root or a sticky header with the property keeps its content clear of the band without the
// padding, so killing the padding alone leaves those routes green for a reason that is not inertness.
const BREAK_CSS = ':root { --play-band: 0px !important; } html > body { padding-top: 0 !important; }';
const HOSTILE_CSS = BREAK_BAND ? BREAK_CSS : (process.env.BAND_HOSTILE_CSS || '');

// The owner's numbers (gh#268 ruling 2026-10-20), restated here because the probe is the gate on them.
export const BAND_PX = 56;
export const BAND_GROUND = 'rgb(20, 20, 43)';
const PHONE = [320, 568];
const DESKTOP = [1280, 800];
// Sub-pixel slack for layout rounding; a real overlap is whole pixels.
const TOL = 0.5;
export const CHROME_IDS = ['play-band', 'play-exit', 'play-edit-players', 'play-crawl-home'];
// THE ONE CARVE-OUT (owner ruling 2026-11-13, gh#314 1a B): the route whose MC control may sit in the band,
// and that control's root. See the header for what is asserted instead.
export const MC_ROUTE = 'prize-draw';
export const MC_SEL = '.pd-mc';
// THE SECOND CARVE-OUT (owner ruling 2026-11-14): the demo routes whose bar may stand in the band, the bar's
// root, and the viewport whose data-bar attribute says where the page placed it. See the header.
export const DEMO_ROUTES = ['prize-cards', 'prize-fireworks', 'prize-ladder'];
export const BAR_SEL = '.pr-bar';
export const BAR_VIEWPORT_SEL = '.pr-viewport';

/**
 * THE SHAPE THE CARVE-OUT ADMITS. The box read below is exact only for untransformed geometry: a real
 * element's border box, and a ::before/::after placed by its own px insets and size. Re-implementing CSS
 * geometry past that (transforms, flow-placed or relatively placed pseudo boxes) never converges, so the
 * project's own control is held to that shape instead, and anything else reds. `parts` is the MC control's
 * root and every shown descendant, each with its computed style and its two pseudo-elements' computed
 * styles. `chain` is every ancestor of the root up to the document element, each with its computed style:
 * a transformed ancestor moves and scales every box under it, and becomes the containing block a fixed
 * root or a positioned pseudo is placed against, so the whole chain is held to the same rule (any
 * containing block a positioned pseudo can have is in `parts` or in `chain`). Returns one line per fault,
 * empty when the read is exact. Self-contained: its source is embedded into the in-page read as is.
 */
export function carveOutShapeFaults(parts, chain = [], what = 'the MC control') {
  const isPx = (v) => /^-?\d*\.?\d+px$/.test(String(v ?? '').trim());
  const moved = (s) => {
    const out = ['transform', 'translate', 'rotate', 'scale'].filter((k) => s[k] && s[k] !== 'none').map((k) => `${k}: ${s[k]}`);
    const z = String(s.zoom ?? '1').trim();
    if (z !== '1' && z !== 'normal' && z !== '') out.push(`zoom: ${z}`);
    return out;
  };
  const faults = [];
  for (const a of chain) for (const m of moved(a.style)) faults.push(`${a.sel} (an ancestor of ${what}) ${m}`);
  for (const p of parts) {
    for (const m of moved(p.style)) faults.push(`${p.sel} ${m}`);
    for (const [which, s] of p.pseudos) {
      if (!s || s.content === 'none' || s.content === 'normal' || s.display === 'none') continue;
      for (const m of moved(s)) faults.push(`${p.sel}${which} ${m}`);
      if (s.position !== 'absolute') faults.push(`${p.sel}${which} position: ${s.position} (a hit area must be placed by its own insets)`);
      else if (!isPx(s.width) || !isPx(s.height) || !(isPx(s.left) || isPx(s.right)) || !(isPx(s.top) || isPx(s.bottom))) {
        faults.push(`${p.sel}${which} size or insets not resolved to px (width ${s.width}, height ${s.height}, left ${s.left}, right ${s.right}, top ${s.top}, bottom ${s.bottom})`);
      }
    }
  }
  return faults;
}

// Route-own controls, probed per route for box 1 (gh#268 2026-10-18 measure.mjs).
const PRE = { 'short-stick': '#btn-start-setup', 'wire-snip-panic': '#btn-menu-start', 'zero-trigger': '#btn-quick-start' };
const START = {
  // gh#304: the MC's reveal control on the prize-draw projector (outside the scaled frame, real pixels).
  'prize-draw': '.pd-mc button',
  timebomb: '#tb-start', 'short-stick': '#btn-begin-game', 'freeze-tap': '#ruleReadyBtn', 'cannon-flag': '#btn-ready-to-aim',
  'power-meter': '#btn-primary-action', 'dice-loser': '#dl-begin', 'how-close-is-near': '#btnStartGame', 'pinocchio-luck': '#ready',
  'cursed-number': '#startGameBtn', 'wire-snip-panic': '#btn-start-match', 'zero-trigger': '#btn-big-action', 'bangkok-drift': '#readyBtn',
  'croc-bite': '#btn-start-game',
};
const SEED = JSON.stringify(['ต้น', 'มายด์', 'บอส']);
// Deletes the prize-draw store, awaited (the page's open connection closes on versionchange), capped so a
// blocked delete cannot hang the walk. A delete that did not land shows up as the next screen's event.
const DROP_STORE = `return await new Promise((done) => { let q; try { q = indexedDB.deleteDatabase(${JSON.stringify(PRIZE_DB.name)}); } catch { done('threw'); return; }
  q.onsuccess = () => done('deleted'); q.onerror = () => done('error'); setTimeout(() => done('timeout'), 3000); });`;

// ROUTES_ONLY=a,b narrows the walk (a hand run, or ci-probes.sh's narrowed run): a narrowed run is iteration only, never the deploy verdict.
export const playRoutes = () => {
  const only = process.env.ROUTES_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
  const ids = games.filter((g) => g.playRoute).map((g) => g.id).sort()
    .filter((id) => !only?.length || only.includes(id));
  if (!ids.length) throw new Error('no play routes derived from the manifest -- refusing to report a vacuous pass');
  return ids;
};

// The in-page measurement. Returns the band, both controls and every content box that reaches the
// band strip; the verdict is computed outside the page from these numbers.
// WIDTH IS THE LAYOUT VIEWPORT, clientWidth, never innerWidth: a position:fixed full-width band spans
// the layout viewport, which a classic scrollbar (CI's Linux Chrome, ~15px) narrows while innerWidth
// still counts it; a Mac's overlay scrollbar takes nothing, so the two agree there and hide the gap.
// Both are recorded per row.
const MEASURE = `
const BAND = ${BAND_PX}, VW = innerWidth, CW = document.documentElement.clientWidth, VH = innerHeight, CHROME = ${JSON.stringify(CHROME_IDS)}, MC_SEL = ${JSON.stringify(MC_SEL)};
const BAR_SEL = ${JSON.stringify(BAR_SEL)}, BAR_VIEWPORT_SEL = ${JSON.stringify(BAR_VIEWPORT_SEL)};
// Every demo bar in the page, in document order: an anchored entry names its bar by index here.
const barEls = [...document.querySelectorAll(BAR_SEL)];
const r2 = (n) => +n.toFixed(2);
const box = (r) => ({ l: r2(r.left), t: r2(r.top), r: r2(r.right), b: r2(r.bottom) });
const sel = (e) => { const p = []; for (let n = e; n && n.nodeType === 1 && p.length < 4; n = n.parentElement) {
  p.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : (n.classList[0] ? '.' + n.classList[0] : ''))); if (n.id) break; } return p.join(' > '); };
// Effective opacity: the element's own computed opacity times every ancestor's, which is what reaches
// the screen (a parent at 0 paints nothing however opaque the child reads on its own).
const effOpacity = (e) => { let o = 1; for (let a = e; a; a = a.parentElement) o *= parseFloat(getComputedStyle(a).opacity); return r2(o); };
const bandEl = document.getElementById('play-band');
const band = bandEl ? { present: true, ...box(bandEl.getBoundingClientRect()), ground: getComputedStyle(bandEl).backgroundColor,
  position: getComputedStyle(bandEl).position, visibility: getComputedStyle(bandEl).visibility, opacity: effOpacity(bandEl) } : { present: false };
const ctl = (id) => { const c = document.getElementById(id); if (!c) return { present: false };
  let forced = false; if (c.hidden) { c.hidden = false; forced = true; }
  const r = c.getBoundingClientRect(); const s = getComputedStyle(c);
  const out = { present: true, forced, ...box(r), visible: r.width > 0 && r.height > 0 && s.visibility === 'visible',
    visibility: s.visibility, opacity: effOpacity(c), disabled: c.disabled };
  if (forced) c.hidden = true; return out; };
const exit = ctl('play-exit'), edit = ctl('play-edit-players');
const chromeEls = CHROME.map((id) => document.getElementById(id)).filter(Boolean);
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'LINK', 'META', 'NOSCRIPT', 'TITLE']);
// An element's own clip-path inset() as px per side (t, r, b, l); anything other than inset() clips
// nothing here. Percentages resolve against the element's own box, as the property does.
const insetOf = (e, r) => { const cp = getComputedStyle(e).clipPath; const m = /^inset\\(([^)]*)\\)/.exec(cp || '');
  if (!m) return [0, 0, 0, 0]; const v = m[1].split(' round ')[0].trim().split(/\\s+/);
  const px = (s, len) => s.endsWith('%') ? (parseFloat(s) / 100) * len : parseFloat(s) || 0;
  const [t, rr = t, b = t, l = rr] = v; return [px(t, r.height), px(rr, r.width), px(b, r.height), px(l, r.width)]; };
let checked = 0, skippedTiny = 0; const hits = [], anchoredAbove = [];
for (const e of document.body.querySelectorAll('*')) {
  if (SKIP.has(e.tagName.toUpperCase()) || e.closest('defs')) continue;
  if (chromeEls.some((c) => c === e || c.contains(e))) continue;
  const s = getComputedStyle(e);
  // Hidden or not, a box pinned to the viewport above the band lands in it the moment it shows (a
  // closed modal, a toast): padding on <body> cannot move it, so its declared anchor is checked here.
  if ((s.position === 'fixed' || s.position === 'sticky') && s.top !== 'auto') {
    let contained = false, scroller = false;
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const c = getComputedStyle(a);
      if (c.transform !== 'none' || c.filter !== 'none' || c.perspective !== 'none' || /layout|paint|strict|content/.test(c.contain)) contained = true;
      if (s.position === 'sticky' && /auto|scroll|hidden|clip/.test(c.overflowY)) scroller = true; }
    const top = parseFloat(s.top) + insetOf(e, e.getBoundingClientRect())[0];
    // A box an !important display:none pins shut (a route's retired test runner) can never show:
    // an inline display that does not take is that pin, read without knowing any selector.
    let pinnedShut = false;
    if (s.display === 'none') { const prev = e.style.display; e.style.display = 'block';
      pinnedShut = getComputedStyle(e).display === 'none'; e.style.display = prev; }
    if (!contained && !scroller && !pinnedShut && top < BAND - ${TOL}) anchoredAbove.push({ sel: sel(e), position: s.position, top: s.top, effectiveTop: r2(top), display: s.display, mc: !!e.closest(MC_SEL), bar: barEls.indexOf(e) });
  }
  const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) continue;
  if (s.visibility !== 'visible') continue;
  let eo = 1; for (let a = e; a; a = a.parentElement) eo *= parseFloat(getComputedStyle(a).opacity); if (eo <= 0.01) continue;
  if (r.width <= 1 || r.height <= 1) { skippedTiny++; continue; }
  checked++;
  const [it, ir, ib, il] = insetOf(e, r);
  let L = r.left + il, T = r.top + it, R = r.right - ir, B = r.bottom - ib;
  for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
    const c = getComputedStyle(a);
    if (c.overflowX !== 'visible' || c.overflowY !== 'visible') { const q = a.getBoundingClientRect();
      L = Math.max(L, q.left); T = Math.max(T, q.top); R = Math.min(R, q.right); B = Math.min(B, q.bottom); } }
  const w = Math.min(R, CW) - Math.max(L, 0), h = Math.min(B, BAND) - Math.max(T, 0);
  if (w > ${TOL} && h > ${TOL}) hits.push({ sel: sel(e), ...box(r), overlapPx: r2(h), pos: s.position, mc: !!e.closest(MC_SEL) });
}
hits.sort((a, b) => b.overlapPx - a.overlapPx);
// The MC control's whole box: the union of its root, every descendant, and every ::before/::after of
// them (a pseudo-element is the usual way to widen a hit area past the visible pill). A positioned
// pseudo is placed from its resolved insets against its containing block; an in-flow one lies inside
// its owner; an auto-sized one falls back to its owner's box. Transforms on a pseudo are not modelled.
const carveOutShapeFaults = ${carveOutShapeFaults.toString()};
const pxv = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const pseudoBox = (p, which, q) => { const s = getComputedStyle(p, which);
  if (s.content === 'none' || s.content === 'normal' || s.display === 'none') return null;
  if (s.position !== 'absolute' && s.position !== 'fixed') return box(q);
  let W = pxv(s.width), H = pxv(s.height); if (W === null || H === null) return box(q);
  if (s.boxSizing !== 'border-box') { W += pxv(s.paddingLeft) + pxv(s.paddingRight) + pxv(s.borderLeftWidth) + pxv(s.borderRightWidth);
    H += pxv(s.paddingTop) + pxv(s.paddingBottom) + pxv(s.borderTopWidth) + pxv(s.borderBottomWidth); }
  let cb;
  if (s.position === 'fixed') cb = { l: 0, t: 0, w: CW, h: VH };
  else { let a = p; while (a.parentElement && getComputedStyle(a).position === 'static') a = a.parentElement;
    const ar = a.getBoundingClientRect(), as = getComputedStyle(a);
    cb = { l: ar.left + pxv(as.borderLeftWidth), t: ar.top + pxv(as.borderTopWidth), w: a.clientWidth, h: a.clientHeight }; }
  const L0 = pxv(s.left), R0 = pxv(s.right), T0 = pxv(s.top), B0 = pxv(s.bottom);
  const x = L0 !== null ? cb.l + L0 + pxv(s.marginLeft) : R0 !== null ? cb.l + cb.w - R0 - pxv(s.marginRight) - W : q.left;
  const y = T0 !== null ? cb.t + T0 + pxv(s.marginTop) : B0 !== null ? cb.t + cb.h - B0 - pxv(s.marginBottom) - H : q.top;
  return { l: r2(x), t: r2(y), r: r2(x + W), b: r2(y + H) }; };
// EVERY element matching the MC selector is measured: the exemption above covers each of them, so each is
// judged, and the shape each is built from is classified (carveOutShapeFaults). The demo bar is read the same way.
const whole = (mcEl, what) => { let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity, pseudo = 0; const parts = [mcEl, ...mcEl.querySelectorAll('*')];
  const add = (q) => { if (!q || q.r - q.l <= 0 || q.b - q.t <= 0) return; L = Math.min(L, q.l); T = Math.min(T, q.t); R = Math.max(R, q.r); B = Math.max(B, q.b); };
  const styled = [];
  for (const p of parts) { const ps = getComputedStyle(p); if (ps.display === 'none') continue; const q = p.getBoundingClientRect(); add(box(q));
    styled.push({ sel: sel(p), style: ps, pseudos: ['::before', '::after'].map((w) => [w, getComputedStyle(p, w)]) });
    for (const w of ['::before', '::after']) { const pb = pseudoBox(p, w, q); if (pb) { pseudo++; add(pb); } } }
  const chain = [];
  for (let a = mcEl.parentElement; a; a = a.parentElement) chain.push({ sel: sel(a), style: getComputedStyle(a) });
  const shape = carveOutShapeFaults(styled, chain, what);
  return R > L ? { present: true, shown: true, l: r2(L), t: r2(T), r: r2(R), b: r2(B), parts: parts.length, pseudo, shape } : { present: true, shown: false, parts: parts.length, pseudo, shape }; };
const mcs = [...document.querySelectorAll(MC_SEL)].map((e) => whole(e, 'the MC control'));
// ONE ROW: every shown item under the bar and every line box of its text crosses one horizontal line, i.e.
// the lowest top is above the highest bottom. A wrapped item, a wrapped group or a wrapped line breaks it.
const rowOf = (el) => { let top = -Infinity, bottom = Infinity, n = 0;
  const take = (q) => { if (q.width <= 0 || q.height <= 0) return; n++; top = Math.max(top, q.top); bottom = Math.min(bottom, q.bottom); };
  for (const d of el.querySelectorAll('*')) if (getComputedStyle(d).display !== 'none') take(d.getBoundingClientRect());
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let t = tw.nextNode(); t; t = tw.nextNode()) { if (!t.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(t); for (const q of rg.getClientRects()) take(q); }
  return { oneRow: n === 0 || top < bottom - ${TOL}, rowItems: n, rowTop: n ? r2(top) : null, rowBottom: n ? r2(bottom) : null }; };
const bars = barEls.map((e) => ({ ...whole(e, 'the demo bar'), ...rowOf(e), mode: e.closest(BAR_VIEWPORT_SEL)?.getAttribute('data-bar') ?? null }));
// A fingerprint of what the route shows right now (visible elements by id/tag with their text), so a
// transition that was meant to change the screen can be told from a click that changed nothing. An
// animated counter only ever makes two reads differ, never makes two different screens agree.
let sigSrc = '';
for (const e of document.body.querySelectorAll('*')) {
  if (SKIP.has(e.tagName.toUpperCase()) || chromeEls.some((c) => c === e || c.contains(e))) continue;
  const q = e.getBoundingClientRect(); if (q.width <= 0 || q.height <= 0) continue;
  sigSrc += (e.id || e.tagName) + (e.disabled ? '!' : '') + ':' + (e.children.length ? '' : (e.textContent || '').trim()) + '|'; }
let sig = 0; for (let i = 0; i < sigSrc.length; i++) sig = (Math.imul(sig, 31) + sigSrc.charCodeAt(i)) | 0;
return { sig, renderHold: document.documentElement.getAttribute('data-render-hold'), handover: document.documentElement.getAttribute('data-player-screen-handover'), vw: VW, vh: VH, clientWidth: CW, bodyPaddingTop: getComputedStyle(document.body).paddingTop,
  sharedScreenOpen: document.documentElement.getAttribute('data-player-screen'), band, exit, edit, checked, skippedTiny,
  hitCount: hits.length, mcHitCount: hits.filter((h) => h.mc).length, hits: [...hits.filter((h) => !h.mc).slice(0, 12), ...hits.filter((h) => h.mc).slice(0, 4)], anchoredAbove, mcs, bars };`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (s) => `const b=document.querySelector(${JSON.stringify(s)});if(!b)return 'absent';const r=b.getBoundingClientRect();if(!r.width)return 'hidden';if(b.disabled)return 'disabled';b.click();return 'clicked';`;
const PLANT = HOSTILE_CSS
  ? `document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.id='band-hostile';s.textContent=${JSON.stringify(HOSTILE_CSS)};document.head.append(s);});`
  : '';

export default async function run(session) {
  if (PLANT) await session.onNewDocument(PLANT);
  const rows = [];
  const read = async (route, state, vp, notes) => {
    const r = await session.evaluate(MEASURE);
    rows.push({ route, state, vp: vp.join('x'), notes, ...(r.error ? { error: r.error } : r.value) });
  };
  for (const id of playRoutes()) {
    const url = `${BASE}/game/${id}/play/`;
    // S1 -- fresh device.
    await session.setWidth(...PHONE);
    await session.nav(url);
    await session.wipe();
    await session.evaluate(DROP_STORE);
    await session.nav(url);
    await session.setWidth(...PHONE);
    await sleep(1500);
    await read(id, 'S1', PHONE, []);
    // The control leg stops here. Its question is only whether the detector reds each route once the
    // reserve is gone, and the fresh 320 screen answers it on every route (measured: a full four-screen
    // control run redded S1 on all of them), so the other screens would add CI time and no signal.
    if (BREAK_BAND) continue;
    // D1 -- the same fresh screen at a desktop width (band height is not width-dependent).
    await session.setWidth(...DESKTOP, false);
    await sleep(600);
    await read(id, 'D1', DESKTOP, []);
    // S2 -- seeded roster, shared screen closed.
    await session.evaluate(`localStorage.clear();sessionStorage.clear();localStorage.setItem('watduang:roster',${JSON.stringify(SEED)});localStorage.setItem('watduang:group',${JSON.stringify(SEED)});return 1;`);
    await session.evaluate(DROP_STORE);
    const screenless = screenlessPlayPaths().has(`/game/${id}/play/`);
    if (screenless) await session.evaluate(routeSeed(url));
    await session.setWidth(...PHONE);
    await session.nav(url);
    await session.setWidth(...PHONE);
    await sleep(1800);
    const notes = [];
    if (PRE[id]) { notes.push(`${PRE[id]}:${(await session.evaluate(click(PRE[id]))).value}`); await sleep(1500); }
    const open = !screenless && (await session.evaluate(`const b=document.querySelector('[data-ps=start]');return !!b&&b.getBoundingClientRect().width>0;`)).value;
    if (open) { notes.push(`[data-ps=start]:${(await session.evaluate(click('[data-ps=start]'))).value}`); await sleep(1500); }
    await read(id, 'S2', PHONE, [...notes]);
    // S3 -- the route's own round start.
    if (START[id]) {
      const n = `${START[id]}:${(await session.evaluate(click(START[id]))).value}`;
      await sleep(1500);
      await read(id, 'S3', PHONE, [n]);
    }
    // D2 -- the MC route's seeded screen at the desktop width, nothing pressed: the carve-out's check at
    // that width needs a screen that shows the MC control, and D1 (a fresh device) holds no event.
    if (id === MC_ROUTE) {
      await session.wipe();
      await session.evaluate(DROP_STORE);
      await session.evaluate(routeSeed(url));
      await session.setWidth(...DESKTOP, false);
      await session.nav(url);
      await session.setWidth(...DESKTOP, false);
      await sleep(1800);
      await read(id, 'D2', DESKTOP, []);
    }
  }
  return { base: BASE, breakBand: BREAK_BAND, hostileCss: HOSTILE_CSS || null, routes: playRoutes(), rows };
}

// --- the verdict -------------------------------------------------------------------------------------
const r2 = (n) => +n.toFixed(2);
// The chrome dims a control to this while it is not armed (PlayExit's disabled readout), so a disabled
// control is expected at this level and an enabled one at full; anything below its level is a fault.
const DISABLED_OPACITY = 0.55;
const OPACITY_SLACK = 0.02;
const inside = (b, cw) => b.t >= -TOL && b.b <= BAND_PX + TOL && b.l >= -TOL && b.r <= cw + TOL;
const overlap = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > TOL && Math.min(a.b, b.b) - Math.max(a.t, b.t) > TOL;
// Route content in the band, less the MC control's boxes on the one route the carve-out names. On any
// other route those boxes are content like the rest and red.
export const contentHitCount = (id, r) => (r.hitCount || 0) - (id === MC_ROUTE ? r.mcHitCount || 0 : 0);

export function judge(out) {
  const failures = [];
  const routes = out.routes;
  const expected = out.breakBand ? routes.length : routes.length * 3 + routes.filter((id) => START[id]).length + routes.filter((id) => id === MC_ROUTE).length;
  if (out.rows.length !== expected) failures.push(`${out.rows.length} row(s), expected ${expected} -- a screen that was never read reads exactly like a clean one`);
  for (const id of routes) {
    const rows = out.rows.filter((r) => r.route === id);
    const pillShown = rows.some((r) => r.edit?.present && !r.edit.forced && r.edit.visible);
    for (const r of rows) {
      const tag = `${id} ${r.state} ${r.vp}`;
      if (r.error) { failures.push(`${tag}: measurement threw: ${r.error}`); continue; }
      if (!(r.checked > 0)) failures.push(`${tag}: no visible route-content box was checked -- an empty page reads exactly like a clean one`);
      const absent = (r.notes || []).filter((n) => n.endsWith(':absent'));
      if (absent.length) failures.push(`${tag}: declared route control absent (${absent.join(', ')}) -- the walk did not reach the screen it names`);
      // Every press the walk made must have landed. A control that is hidden or disabled returns that
      // word instead of 'clicked', and the screen the row names was then never reached.
      const unpressed = (r.notes || []).filter((n) => !n.endsWith(':absent') && !n.endsWith(':clicked'));
      if (unpressed.length) failures.push(`${tag}: control not pressed (${unpressed.join(', ')}) -- the walk did not reach the screen it names`);
      if ((r.state === 'S2' || r.state === 'S3') && screenlessPlayPaths().has(`/game/${id}/play/`)) {
        // gh#304: no shared screen here, so none of its attributes may appear, and the round start must
        // change the page.
        const why = [];
        if (r.sharedScreenOpen !== null && r.sharedScreenOpen !== undefined) why.push(`data-player-screen is ${JSON.stringify(r.sharedScreenOpen)} on a route with no shared player screen`);
        if (r.state === 'S3' && !(r.notes || []).some((n) => n.endsWith(':clicked'))) why.push('the route round-start control was never pressed');
        const s2 = rows.find((q) => q.state === 'S2');
        if (r.state === 'S3' && s2 && r.sig === s2.sig) why.push('the page shows exactly what it showed before the round start, so no round began');
        if (why.length) failures.push(`${tag}: the transition did not happen -- ${why.join('; ')}`);
      } else if (r.state === 'S2' || r.state === 'S3') {
        // The state after the press, read from the page: the shared screen closed, the hold released, and
        // the route acknowledged the handover. Each is asserted on its own so the red names the one missing.
        const why = [];
        if (r.sharedScreenOpen !== 'closed') why.push(`data-player-screen is ${JSON.stringify(r.sharedScreenOpen)}, expected "closed"`);
        if (r.renderHold !== 'free') why.push(`data-render-hold is ${JSON.stringify(r.renderHold)}, expected "free"`);
        if (!(Number(r.handover) >= 1)) why.push(`data-player-screen-handover is ${JSON.stringify(r.handover)}, expected a count of 1 or more`);
        if (r.state === 'S2' && !(r.notes || []).some((n) => n === '[data-ps=start]:clicked')) why.push('the shared screen start was never pressed');
        if (r.state === 'S3' && !(r.notes || []).some((n) => n.endsWith(':clicked'))) why.push('the route round-start control was never pressed');
        const s2 = rows.find((q) => q.state === 'S2');
        if (r.state === 'S3' && s2 && r.sig === s2.sig) why.push('the page shows exactly what it showed before the round start, so no round began');
        if (why.length) failures.push(`${tag}: the transition did not happen -- ${why.join('; ')}`);
      }
      if (!r.state.startsWith('D') && (r.vw !== PHONE[0] || r.clientWidth !== PHONE[0])) failures.push(`${tag}: viewport ${r.vw}/${r.clientWidth}, expected ${PHONE[0]} -- run is void`);
      const b = r.band;
      if (!b?.present) failures.push(`${tag}: no #play-band element`);
      else {
        if (Math.abs(b.t) > TOL || Math.abs(b.b - b.t - BAND_PX) > TOL || Math.abs(b.l) > TOL || Math.abs(b.r - r.clientWidth) > TOL) failures.push(`${tag}: band box ${JSON.stringify(b)} is not 0..${BAND_PX} x 0..${r.clientWidth} (innerWidth ${r.vw}, clientWidth ${r.clientWidth})`);
        if (b.ground !== BAND_GROUND) failures.push(`${tag}: band ground ${b.ground}, expected ${BAND_GROUND}`);
      }
      if (!r.exit?.present || !r.exit.visible || r.exit.forced) failures.push(`${tag}: close X not shown`);
      else if (!inside(r.exit, r.clientWidth)) failures.push(`${tag}: close X ${JSON.stringify(r.exit)} is not inside the band`);
      // PAINTED, not just placed: a box with a position and a size can still be fully transparent.
      if (b?.present && !(b.visibility === 'visible' && b.opacity >= 1 - OPACITY_SLACK)) failures.push(`${tag}: band not painted (visibility ${b.visibility}, effective opacity ${b.opacity})`);
      for (const [name, c] of [['close X', r.exit], ['edit control', r.edit]]) {
        if (!c?.present) continue;
        const floor = (c.disabled ? DISABLED_OPACITY : 1) - OPACITY_SLACK;
        if (c.visibility !== 'visible' || !(c.opacity >= floor)) failures.push(`${tag}: ${name} not painted (visibility ${c.visibility}, effective opacity ${c.opacity}, expected at least ${r2(floor)}${c.forced ? ', forced read' : ''})`);
      }
      if (!r.edit?.present) failures.push(`${tag}: no #play-edit-players`);
      else {
        if (!inside(r.edit, r.clientWidth)) failures.push(`${tag}: edit control ${JSON.stringify(r.edit)}${r.edit.forced ? ' (forced read)' : ''} is not inside the band`);
        if (r.exit?.present && overlap(r.exit, r.edit)) failures.push(`${tag}: edit control overlaps the close X`);
      }
      const exempt = id === MC_ROUTE;
      // The demo bar's exemption: a demo route, the bar element itself, and its viewport placed it in the band.
      const barOf = (a) => (DEMO_ROUTES.includes(id) && a.bar >= 0 ? (r.bars || [])[a.bar] : undefined);
      const barExempt = (a) => barOf(a)?.mode === 'band';
      const anchored = (r.anchoredAbove || []).filter((a) => !(exempt && a.mc) && !barExempt(a));
      if (anchored.length) failures.push(`${tag}: ${anchored.length} fixed/sticky route box(es) anchored above the band: ${anchored.slice(0, 4).map((a) => `${a.sel} (${a.position} top ${a.top}${a.display === 'none' ? ', hidden now' : ''})`).join('; ')}`);
      // The bar carve-out's own assertion, on every row that used the exemption: one bar, shown, measured exactly,
      // inside the band, clear of both band controls, on one row.
      const admitted = (r.anchoredAbove || []).filter(barExempt);
      if (admitted.length > 1) failures.push(`${tag}: ${admitted.length} demo bars (${BAR_SEL}) anchored above the band -- the carve-out admits exactly one`);
      for (const a of admitted) {
        const m = barOf(a);
        const what = `demo bar ${a.sel}`;
        if (m.shape?.length) failures.push(`${tag}: ${what}: the carve-out geometry is outside the shape this probe can measure (no transform, translate, rotate, scale or zoom on it or any ancestor; hit areas are border boxes or inset-placed pseudo-elements): ${m.shape.slice(0, 4).join('; ')}`);
        if (!m.shown) { failures.push(`${tag}: ${what} is anchored above the band but shows no box, so the carve-out judged nothing`); continue; }
        const at = JSON.stringify({ l: m.l, t: m.t, r: m.r, b: m.b });
        if (!inside(m, r.clientWidth)) failures.push(`${tag}: ${what} ${at} is not inside the band 0..${BAND_PX} x 0..${r.clientWidth}`);
        if (r.exit?.present && overlap(m, r.exit)) failures.push(`${tag}: ${what} ${at} overlaps the close X ${JSON.stringify(r.exit)}`);
        if (r.edit?.present && overlap(m, r.edit)) failures.push(`${tag}: ${what} ${at} overlaps the edit control${r.edit.forced ? ' (forced read)' : ''} ${JSON.stringify(r.edit)}`);
        if (!m.oneRow) failures.push(`${tag}: ${what} ${at} is not one row (lowest item top ${m.rowTop}, highest item bottom ${m.rowBottom})`);
      }
      const hitCount = contentHitCount(id, r);
      if (hitCount > 0) failures.push(`${tag}: ${hitCount} route-content box(es) intersect the band, worst ${(r.hits || []).filter((h) => !(exempt && h.mc)).slice(0, 3).map((h) => `${h.sel} (${h.overlapPx}px, top ${h.t})`).join('; ')}`);
      // The carve-out's own assertion, on every screen and width the walk reads, for EVERY .pd-mc element
      // (each is exempt, so each is judged): built only from geometry the read is exact for, at most one
      // shown, and each shown one (root, descendants, pseudo-element hit areas) clear of both band controls
      // and on screen.
      const mcs = exempt ? r.mcs || [] : [];
      const shape = mcs.flatMap((m) => m.shape || []);
      if (shape.length) failures.push(`${tag}: the carve-out geometry is outside the shape this probe can measure (no transform, translate, rotate, scale or zoom on it or any ancestor; hit areas are border boxes or inset-placed pseudo-elements): ${shape.slice(0, 4).join('; ')}`);
      const shownMcs = mcs.filter((m) => m.present && m.shown);
      if (shownMcs.length > 1) failures.push(`${tag}: ${shownMcs.length} MC controls (${MC_SEL}) shown -- the carve-out admits exactly one`);
      for (const m of shownMcs) {
        if (r.exit?.present && overlap(m, r.exit)) failures.push(`${tag}: MC control ${JSON.stringify(m)} overlaps the close X ${JSON.stringify(r.exit)}`);
        if (r.edit?.present && overlap(m, r.edit)) failures.push(`${tag}: MC control ${JSON.stringify(m)} overlaps the edit control${r.edit.forced ? ' (forced read)' : ''} ${JSON.stringify(r.edit)}`);
        if (!(m.l >= -TOL && m.t >= -TOL && m.r <= r.clientWidth + TOL && m.b <= r.vh + TOL)) failures.push(`${tag}: MC control ${JSON.stringify(m)} is not inside the viewport 0..${r.clientWidth} x 0..${r.vh}`);
      }
    }
    // The carve-out's check must have run: the MC control shown on at least one walked screen per width.
    // Hidden on a screen is legitimate (a reveal presenting, no event yet); hidden on every screen of a
    // width means no overlap was ever measured there, which reads exactly like a clean pass.
    if (id === MC_ROUTE && !out.breakBand) {
      for (const vp of [...new Set(rows.map((r) => r.vp))]) {
        if (!rows.some((r) => r.vp === vp && (r.mcs || []).some((m) => m.present && m.shown))) failures.push(`${id} ${vp}: the carve-out check never ran -- the MC control (${MC_SEL}) was shown on no walked screen at this width`);
      }
    }
    for (const r of rows) r.pillForced = !pillShown;
  }
  return failures;
}

function main() {
  const jsonPath = path.join(os.tmpdir(), `play-top-band-probe-${process.pid}.json`);
  const fd = fs.openSync(jsonPath, 'w');
  let run;
  try {
    run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/driver.mjs'), fileURLToPath(import.meta.url)], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', fd, 'pipe'], env: { ...process.env, CDP_PORT, BASE },
    });
  } finally {
    fs.closeSync(fd);
  }
  const raw = fs.readFileSync(jsonPath, 'utf8');
  fs.rmSync(jsonPath, { force: true });
  if (run.status !== 0) {
    console.error(`::error::the browser leg did not run (exit ${run.status}). Serve dist/ on ${BASE} and start Chrome with --remote-debugging-port=${CDP_PORT} first.\n${(run.stderr || '').trim()}`);
    process.exit(1);
  }
  const out = JSON.parse(raw);
  const failures = judge(out);
  const redRoutes = out.routes.filter((id) => failures.some((f) => f.startsWith(`${id} `)));
  const contentRed = out.routes.filter((id) => out.rows.some((r) => r.route === id && contentHitCount(id, r) > 0));
  const report = {
    n: out.routes.length,
    flags: { base: BASE, breakBand: BREAK_BAND, hostileCss: out.hostileCss, bandPx: BAND_PX, phone: PHONE.join('x'), desktop: DESKTOP.join('x') },
    pass: BREAK_BAND ? contentRed.length === out.routes.length && out.rows.length === out.routes.length : failures.length === 0,
    redRoutes, contentRedRoutes: contentRed, failures, rows: out.rows,
  };
  if (process.env.BAND_OUT) fs.writeFileSync(process.env.BAND_OUT, `${JSON.stringify(report, null, 1)}\n`);
  if (BREAK_BAND) {
    // The control leg: green only when the detector reds on content on EVERY route.
    if (report.pass) { console.log(`OK control: content red on all ${out.routes.length} route(s) with the band mechanism removed`); process.exit(0); }
    console.error(`::error::control leg: content stayed green on ${out.routes.filter((id) => !contentRed.includes(id)).join(', ')} with the band mechanism removed -- the detector is inert there`);
    process.exit(1);
  }
  for (const f of failures) console.error(`::error::${f}`);
  if (failures.length) { console.error(`FAIL ${failures.length} failure(s) across ${redRoutes.length}/${out.routes.length} route(s): ${redRoutes.join(', ')}`); process.exit(1); }
  console.log(`OK ${out.rows.length} screen(s) across ${out.routes.length} route(s): both controls inside the ${BAND_PX}px band, no route content intersects it${out.rows.some((r) => r.pillForced) ? ` (edit control read forced on: ${[...new Set(out.rows.filter((r) => r.pillForced).map((r) => r.route))].join(', ')})` : ''}`);
}

const isEntryPoint = () => {
  if (!process.argv[1]) return false;
  const canonical = (p) => pathToFileURL(fs.realpathSync(p)).href;
  try {
    return canonical(process.argv[1]) === canonical(fileURLToPath(import.meta.url));
  } catch {
    return true;
  }
};
if (isEntryPoint()) main();
