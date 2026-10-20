#!/usr/bin/env node
// PAINTED-FACE probe for the shared player screen and its two dialogs, on every party play route (gh#277).
//
// WHY A BROWSER LEG. scripts/ps-font-binding-check.mjs grades DECLARED font bindings and says in its own
// header that it cannot compute the effective cascade: an `all:` reset, a `font:` shorthand, a route rule
// on the mount root by id or with !important, or a style object reached through an alias can each change
// the face that paints while the static gate stays green. This leg opens the BUILT page in a real browser
// and asks getComputedStyle, so the mechanism is caught by where it lands rather than where it was written.
//
// THE INVARIANT, one sentence: for every visible element under the shared screen's root (.ps) and inside
// either dialog that owns a non-blank text node or is a form control, the FIRST family of its computed
// font-family is one of the site's self-hosted families, read after document.fonts.ready from the faces
// document.fonts holds with status `loaded`. That is a statement about the cascade's result, not about
// glyphs: which platform font finally paints a given character depends on the subsetter, the text and the
// machine, so platform fonts (CSS.getPlatformFontsForNode) are REPORTED per row and never graded.
//
// THE ROUTE SET IS THE MANIFEST, imported, never listed here: every game with a playRoute in the party
// category (ADR-0040 keeps fortune pages and tools out of "game"). An empty set is an error, not a pass.
//
// WHAT IT DRIVES. Each route is loaded on a wiped roster, the shared screen is opened (by itself, or by
// the chrome's own edit event on a route that opens it after an intro), Thai and Latin player names are
// typed into the name fields, a duplicate is typed to raise the limit line, and both dialogs are raised
// through showModal() directly: paint does not depend on how a dialog was raised, and the edit dialog
// opens in the product only mid-round. Every state is graded against ANCHORS, so a region whose walk found
// nothing reds instead of reading as clean.
//
// WHAT ITS GREEN DOES NOT MEAN. One viewport, one browser; the saved-roster screen (ticks, remove, undo
// toast) is not driven; an element painted only from pseudo-element content has no text node and is not
// seen; and a first family that is self-hosted proves the cascade, not that every glyph found a face in it.
//
// SELF-CALIBRATING. A check that passes on "nothing was wrong" cannot show it can fail, so each route is
// walked three times in ONE document, with no second load: clean first, then with a hostile stylesheet
// injected at run time and removed again after each pass.
//   root pass:   `#<mount-root-id> { font-family: serif !important }` must red the in-flow rows
//                (screen and limit states): at least one graded row computes first family `serif`.
//   dialog pass: `.ps-dialog, .ps-dialog * { font-family: serif !important }` must red EVERY graded row of
//                both dialogs, so a dialog row the detector cannot see is named as a miss.
// The run exits non-zero if the clean pass has any red row, or either hostile pass fails to red its
// region: a hostile pass that stays green means the probe is blind, which is a failure, never a pass.
// A FOURTH read rides the same open state, the gameplay hold (gh#269): while the player screen is open
// every element marked `data-first-screen-root="gameplay"` must compute visibility hidden, opacity 0 and
// pointer-events none. Its floor is the route's own game entry: the matched count must equal the number of
// roots the entry classifies as gameplay and be above zero, so an empty or short walk reds; the exception
// is a browser with no WebGL context (read in-page), where a 3D route drops its canvas on its no-3D path:
// there a short count is reported as `missing (no WebGL)` rows, and at least one element must still match
// and every match must be a declared root. Its hostile
// pass injects `#<first declared gameplay root with an id that is present in the DOM> { visibility: visible !important }`; that root
// must then read visible, or the probe is blind to a rule that lifts the hold.
// The same read also owns WHICH element is the screen root: the one carrying the `ps` class (the element
// mountPlayerScreen is handed, not a child) must have no gameplay-root ancestor, compute visible / opacity 1 /
// a non-empty box, and be the ps-mount the game entry declares. Its hostile pass moves that element into a
// gameplay root with a DOM call, re-reads, requires the ancestor check to red, then moves it back.
// After the other passes the start button is pressed and the roots are read again, REPORTED only (a handover is the route's own
// round setup and varies by route).
// A rule on `body` was tried as the dialog pass and reds nothing: every dialog element carries its own
// font binding, so it never reaches a graded dialog row.
//   node scripts/player-screen-face-probe.mjs
// Serve dist/ and start Chrome with --remote-debugging-port first; BASE and CDP_PORT name them. Never
// builds. ROUTES_ONLY=a,b narrows a hand run and says so; it is never set by a gate.
// PROBE_ARTIFACT_DIR=<dir> writes clean.json, root.json and dialog.json (one per pass, full per-route
// rows); PROBE_HOLD_ARTIFACT_DIR=<dir> writes hold.json for the gameplay-hold pass; CHROME_FLAGS=<text> is recorded verbatim in them, because the probe cannot read how its browser
// was launched.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { games } from '../src/games/manifest.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
// Own defaults, deliberately not any other script's: probing a foreign server or browser is how a green
// gets reported for someone else's bytes.
const BASE = process.env.BASE || process.env.PROBE_BASE || 'http://localhost:4466';
const CDP_PORT = process.env.CDP_PORT || '9466';
const VP = { w: 390, h: 844 };
const SETTLE_CAP_MS = 15000;

/** The hostile passes. `root` is filled with the mount root's own id at run time. `mode` says how much of
 *  each expected state must red: `some` = at least one row on the injected face, `every` = all of them. */
export const HOSTILE_PASSES = {
  root: { css: (rootId) => `#${rootId} { font-family: serif !important }`, expect: ['screen', 'limit'], mode: 'some', why: 'the mount root is the inheritance root of every in-flow row' },
  dialog: { css: () => '.ps-dialog, .ps-dialog * { font-family: serif !important }', expect: ['reset', 'edit'], mode: 'every', why: 'a rule on the dialog box and everything in it reaches every dialog row, bound or not' },
};

/** Every party play route the manifest declares. Taking the list as an argument lets a test hand it one. */
export const partyPlayRoutes = (list = games) => {
  const only = process.env.ROUTES_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
  const ids = list.filter((g) => g.playRoute && g.category === 'party').map((g) => g.id).sort()
    .filter((id) => !only?.length || only.includes(id));
  if (!ids.length) throw new Error('no party play routes derived from the manifest -- refusing to report a vacuous pass');
  return ids;
};

/** The keys a game entry classifies as gameplay roots, in declaration order. Read from the entry itself:
 *  a hand list of roots is a list someone forgets. */
export const declaredGameplayRoots = (game) => Object.entries(game?.firstScreenRoots ?? {}).filter(([, role]) => role === 'gameplay').map(([key]) => key);

/** The key a game entry uses for an element: `#id`, or `tag.class.class` for one with no id. */
export const rootKey = (r) => (r.id ? `#${r.id}` : `${String(r.tag).toLowerCase()}${(r.cls || '').split(/\s+/).filter(Boolean).map((c) => `.${c}`).join('')}`);

/** Declared gameplay roots the DOM does not carry, which is only ever reported, never a fault by itself. */
export const holdMissing = (declared, read) => declared.filter((k) => !(read?.roots ?? []).some((r) => rootKey(r) === k));

/** Every reason the hold pass reds one route. `read` is the in-page read taken while the screen is open.
 *  The static gate (first-screen-roots-check) owns "every declared root is marked in the markup"; this read
 *  owns "the walk is non-empty and every marked element that IS present is held". With a WebGL context the
 *  count must also equal the declaration. Without one a 3D route drops its canvas on its no-3D path, so a
 *  short count is allowed there, as missing rows: at least one element must still match, and every match
 *  must be a declared root. */
export function holdFaults(declared, read) {
  if (!read || !Array.isArray(read.roots)) return ['hold: no read came back'];
  const faults = [];
  if (!declared.length) faults.push('hold: the game entry declares no gameplay root, so there is nothing to hold -- a route with a play screen has gameplay');
  if (read.count === 0) faults.push(`hold: 0 gameplay roots matched in the DOM (${declared.length} declared)`);
  const undeclared = read.roots.filter((r) => !declared.includes(rootKey(r)));
  if (undeclared.length) faults.push(`hold: marked gameplay element(s) the game entry does not declare: ${undeclared.map(rootKey).join(', ')}`);
  if (read.webgl === true && read.count > 0 && read.count !== declared.length) {
    faults.push(`hold: ${read.count} gameplay root(s) matched in the DOM, the game entry declares ${declared.length} (${declared.join(', ')})`);
  }
  for (const r of read.roots) {
    const name = `${r.tag}${r.id ? '#' + r.id : ''}${r.cls ? '.' + r.cls.split(' ').join('.') : ''}`;
    if (r.visibility !== 'hidden') faults.push(`hold: ${name} computes visibility ${r.visibility} while the player screen is open, not hidden`);
    if (r.opacity !== '0') faults.push(`hold: ${name} computes opacity ${r.opacity}, not 0`);
    if (r.pointerEvents !== 'none') faults.push(`hold: ${name} computes pointer-events ${r.pointerEvents}, not none`);
  }
  return faults;
}

/** The keys a game entry classifies as the player-screen mount, in declaration order. */
export const declaredMountRoots = (game) => Object.entries(game?.firstScreenRoots ?? {}).filter(([, role]) => role === 'ps-mount').map(([key]) => key);

/** Every reason the screen root reds one route. `read` is the in-page read of the element that carries the
 *  `ps` class. mountPlayerScreen adds that class to the element it is HANDED (it appends the template into
 *  that same element), so the screen root IS the mount element and its key must equal the declared mount. */
export function psRootFaults(declaredMount, read) {
  if (!read || typeof read.count !== 'number') return ['ps root: no read came back'];
  const faults = [];
  if (declaredMount.length !== 1) faults.push(`ps root: the game entry declares ${declaredMount.length} ps-mount root(s), a route mounts exactly one`);
  if (read.count !== 1) { faults.push(`ps root: ${read.count} element(s) carry the \`ps\` class, expected exactly one`); return faults; }
  const key = rootKey(read);
  if (declaredMount.length === 1 && key !== declaredMount[0]) faults.push(`ps root: the element that carries \`ps\` is ${key}, the game entry declares the ps-mount as ${declaredMount[0]}`);
  if (read.insideGameplayRoot) faults.push(`ps root: ${key} sits inside a gameplay root, so the hold hides the screen it waits behind`);
  if (read.visibility !== 'visible') faults.push(`ps root: ${key} computes visibility ${read.visibility} while the player screen is open, not visible`);
  if (read.opacity !== '1') faults.push(`ps root: ${key} computes opacity ${read.opacity}, not 1`);
  if (!(read.width > 0 && read.height > 0)) faults.push(`ps root: ${key} has an empty box (${read.width}x${read.height})`);
  return faults;
}

/** The hostile verdict for the hold: the reason the lifted root did not read visible, or null. */
export const holdHostileMiss = (id, visibility) => (visibility === 'visible' ? null : `#${id} read visibility ${JSON.stringify(visibility)} under \`visibility: visible !important\`, so the hold read cannot see a rule that lifts it`);

// Player-name fixtures this probe owns. Escapes keep Thai out of a source comment-scan's way; the Thai
// one has tone marks and a stacked vowel, the Latin one has a space and a capital.
const NAME_THAI = 'สมชาย ใจดี';
const NAME_LATIN = 'Alex Morgan';

/** What each state must have walked, by selector, or the state reds. `names` counts name fields. */
export const STATES = [
  { key: 'screen', anchors: ['.ps-go', '.ps-hint', '.ps-count-read'], names: 2 },
  { key: 'limit', anchors: ['.ps-limit'], names: 2 },
  { key: 'reset', anchors: ['#ps-reset-title', '#ps-reset-confirm'], names: 0 },
  { key: 'edit', anchors: ['#ps-edit-title', '#ps-edit-confirm'], names: 0 },
];

const firstFamily = (ff) => String(ff).split(',')[0].trim().replace(/^["']|["']$/g, '');

/** Anchors and name-field floors only: a hostile pass must still have walked the region. */
export function floorFaults(spec, walk) {
  const faults = [];
  if (!walk || !Array.isArray(walk.rows)) return [`${spec.key}: no walk came back`];
  for (const a of spec.anchors) {
    if (!walk.rows.some((r) => r.anchors.includes(a))) faults.push(`${spec.key}: anchor ${a} was not among the graded rows -- an empty walk reads exactly like a clean one`);
  }
  const names = walk.rows.filter((r) => r.anchors.includes('.ps-n')).length;
  if (names < spec.names) faults.push(`${spec.key}: ${names} name field(s) graded, ${spec.names} required`);
  return faults;
}

/** Every reason one state reds. `walk` is the in-page read; `allowed` the loaded self-hosted families. */
export function stateFaults(spec, walk, allowed) {
  const faults = floorFaults(spec, walk);
  if (!walk || !Array.isArray(walk.rows)) return faults;
  for (const r of walk.rows) {
    if (!allowed.includes(firstFamily(r.ff))) {
      faults.push(`${spec.key}: ${r.tag}${r.id ? '#' + r.id : ''}${r.cls ? '.' + r.cls.split(' ').join('.') : ''} "${r.text}" computes first family "${firstFamily(r.ff)}", not one of the loaded self-hosted families (${allowed.join(', ')})`);
    }
  }
  return faults;
}

/** The hostile verdict for one route: the reason the injection was NOT seen, or null when it was. */
export function hostileMiss(pass, states, allowed) {
  const miss = [];
  for (const key of pass.expect) {
    const rows = states[key]?.rows ?? [];
    const green = rows.filter((r) => firstFamily(r.ff) !== 'serif' || allowed.includes(firstFamily(r.ff)));
    const injected = rows.length - green.length;
    if (pass.mode === 'every') {
      if (!rows.length) miss.push(`${key}: no graded row at all`);
      else if (green.length) miss.push(`${key}: ${green.length} of ${rows.length} graded row(s) stayed on their own face: ${green.map((r) => `${r.tag}${r.id ? '#' + r.id : ''}${r.cls ? '.' + r.cls.split(' ').join('.') : ''} -> ${firstFamily(r.ff)}`).join(', ')}`);
    } else if (!injected) {
      miss.push(`${key}: no graded row reds on the injected face (0 of ${rows.length})`);
    }
  }
  return miss.length ? miss.join('; ') : null;
}

// ---- a raw CDP session on a fresh tab (driver.mjs exposes no CSS domain, and the platform-font read needs it)
async function openSession(port) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', () => reject(new Error(`no CDP socket on ${port}`))); });
  let id = 0;
  const pending = new Map();
  let loaded = null;
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Page.loadEventFired' && loaded) { loaded(); loaded = null; }
  });
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const d of ['Page', 'Runtime', 'DOM', 'CSS']) await send(`${d}.enable`);
  return {
    send, sleep,
    async ev(expr) {
      const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
      if (r.error || r.result?.exceptionDetails) throw new Error(JSON.stringify(r.error ?? r.result.exceptionDetails).slice(0, 300));
      return r.result?.result?.value;
    },
    async nav(url) {
      const p = new Promise((res) => { loaded = res; });
      await send('Page.navigate', { url });
      await Promise.race([p, sleep(20000)]);
      await sleep(900);
    },
    setVp: (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true }),
    async close() { ws.close(); await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`).catch(() => {}); },
  };
}

// ---- in-page expressions
const SETTLED = `const de = document.documentElement; return { state: de.getAttribute('data-player-screen'), pending: de.hasAttribute('data-player-screen-pending') };`;

/** The loaded self-hosted families, after fonts.ready. A face counts only if its @font-face sources are
 *  all same-origin, so a remote face can never widen the allow-list. */
const FAMILIES = `
  void document.body.offsetHeight;
  await document.fonts.ready;
  const strip = (s) => s.replace(/^["']|["']$/g, '');
  const remote = new Set();
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) {
      if (!(r instanceof CSSFontFaceRule)) continue;
      const src = r.style.getPropertyValue('src');
      const urls = [...src.matchAll(/url\\(\\s*["']?([^"')]+)/g)].map((m) => new URL(m[1], location.href));
      if (urls.some((u) => u.origin !== location.origin) || /local\\(/.test(src)) remote.add(strip(r.style.getPropertyValue('font-family').trim()));
    }
  }
  const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => strip(f.family));
  const declared = [...document.fonts].map((f) => strip(f.family) + ':' + f.status);
  return { loaded: [...new Set(loaded)].filter((f) => !remote.has(f)), declared, remote: [...remote] };
`;

const walkExpr = (rootSel, anchors) => `
  void document.body.offsetHeight;
  await document.fonts.ready;
  document.querySelectorAll('[data-probe]').forEach((e) => e.removeAttribute('data-probe'));
  const root = document.querySelector(${JSON.stringify(rootSel)});
  if (!root) return { rows: [], open: null };
  const ANCHORS = ${JSON.stringify([...anchors, '.ps-n'])};
  const FORM = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);
  const rows = [];
  for (const e of [root, ...root.querySelectorAll('*')]) {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    if (!(r.width > 0 && r.height > 0) || cs.visibility === 'hidden') continue;
    const own = [...e.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent.trim()).join('');
    const control = FORM.has(e.tagName);
    if (!own && !control) continue;
    const n = rows.length;
    e.setAttribute('data-probe', String(n));
    rows.push({ n, tag: e.tagName, id: e.id || null, cls: e.getAttribute('class'), text: (own || e.value || '').slice(0, 24),
      ff: cs.fontFamily, fw: cs.fontWeight, anchors: ANCHORS.filter((a) => e.matches(a)) });
  }
  return { rows, open: root.matches('dialog') ? root.open : !root.hidden };
`;

/** Platform fonts per row, REPORTED and never graded (CSS.getPlatformFontsForNode). */
async function platformFonts(s, rows) {
  const doc = await s.send('DOM.getDocument', { depth: 0 });
  const rootId = doc.result.root.nodeId;
  for (const row of rows) {
    const q = await s.send('DOM.querySelector', { nodeId: rootId, selector: `[data-probe="${row.n}"]` });
    const nodeId = q.result?.nodeId;
    if (!nodeId) { row.platform = null; continue; }
    const f = await s.send('CSS.getPlatformFontsForNode', { nodeId });
    row.platform = (f.result?.fonts ?? []).map((x) => `${x.familyName}|${x.glyphCount}`);
  }
}

const TYPE_NAMES = (a, b) => `
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const f = document.querySelectorAll('.ps-n');
  if (f.length < 2) return { ok: false, fields: f.length };
  const put = (el, v) => { set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  put(f[0], ${JSON.stringify(a)}); put(f[1], ${JSON.stringify(b)});
  return { ok: true, fields: f.length };
`;

const HOLD_READ = `
  const els = [...document.querySelectorAll('[data-first-screen-root="gameplay"]')];
  let webgl = false;
  try { const c = document.createElement('canvas'); webgl = Boolean(c.getContext('webgl2') || c.getContext('webgl')); } catch { webgl = false; }
  return { hold: document.documentElement.getAttribute('data-render-hold'), count: els.length, webgl,
    roots: els.map((e) => { const cs = getComputedStyle(e); return { tag: e.tagName, id: e.id || null, cls: e.getAttribute('class'), visibility: cs.visibility, opacity: cs.opacity, pointerEvents: cs.pointerEvents }; }) };
`;
const PS_ROOT_READ = `
  const all = [...document.querySelectorAll('.ps')];
  const el = all[0];
  if (!el) return { count: 0 };
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return { count: all.length, tag: el.tagName, id: el.id || null, cls: el.getAttribute('class'),
    insideGameplayRoot: Boolean(el.parentElement && el.parentElement.closest('[data-first-screen-root="gameplay"]')) || el.matches('[data-first-screen-root="gameplay"]'),
    visibility: cs.visibility, opacity: cs.opacity, width: Math.round(r.width), height: Math.round(r.height) };
`;
/** Moves the screen root into the first gameplay root that neither holds it nor sits inside it, remembering
 *  where it was. Returns the target's key, or null when there is none to move into. */
const PS_MOVE_IN = `
  const el = document.querySelector('.ps');
  const target = [...document.querySelectorAll('[data-first-screen-root="gameplay"]')].find((t) => !el.contains(t) && !t.contains(el));
  if (!el || !target) return null;
  window.__psHome = { parent: el.parentNode, next: el.nextSibling };
  target.appendChild(el);
  return { id: target.id || null, tag: target.tagName };
`;
const PS_MOVE_BACK = `
  const el = document.querySelector('.ps');
  const home = window.__psHome;
  if (!el || !home) return false;
  home.parent.insertBefore(el, home.next);
  delete window.__psHome;
  return true;
`;
const VISIBILITY_OF = (id) => `const e = document.getElementById(${JSON.stringify(id)}); return e ? getComputedStyle(e).visibility : null;`;
const HANDOVER = `
  const start = document.querySelector('.ps-go');
  const t0 = Date.now();
  while (start && start.disabled && Date.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 100));
  if (!start || start.disabled) return { pressed: false };
  start.click();
  const t1 = Date.now();
  while (document.documentElement.getAttribute('data-render-hold') !== 'free' && Date.now() - t1 < 8000) await new Promise((r) => setTimeout(r, 100));
  return { pressed: true, hold: document.documentElement.getAttribute('data-render-hold'), handover: document.documentElement.getAttribute('data-player-screen-handover'), screen: document.documentElement.getAttribute('data-player-screen') };
`;
const SHOW_DIALOG = (id) => `const d = document.getElementById(${JSON.stringify(id)}); if (!d) return { opened: false, why: 'missing' }; if (!d.open) d.showModal(); return { opened: d.open };`;
const CLOSE_DIALOG = (id) => `const d = document.getElementById(${JSON.stringify(id)}); if (d?.open) d.close(); return { open: d?.open ?? null };`;
const REMOVE = `document.querySelectorAll('#probe-hostile').forEach((e) => e.remove()); return true;`;
const INJECT = (css) => `const st = document.createElement('style'); st.id = 'probe-hostile'; st.textContent = ${JSON.stringify(css)}; document.head.appendChild(st); return true;`;

async function waitSettled(s) {
  const t0 = Date.now();
  for (;;) {
    const v = await s.ev(SETTLED);
    if (v.state && !v.pending) return v.state;
    if (Date.now() - t0 > SETTLE_CAP_MS) return null;
    await s.sleep(100);
  }
}

async function walkRoute(s, id) {
  const game = games.find((g) => g.id === id);
  const declared = declaredGameplayRoots(game);
  const row = { route: id, url: `/game/${id}/play/`, declared, hold: null, error: null, openedBy: 'itself', rootId: null, allowed: null, fontReport: null, passes: { clean: {}, root: {}, dialog: {} }, platform: {} };
  const url = `${BASE}${row.url}`;
  await s.nav(url);
  await s.ev('localStorage.clear(); sessionStorage.clear(); return true;');
  await s.nav(url);
  await s.setVp(VP.w, VP.h);
  await s.sleep(900);
  const iw = await s.ev('return innerWidth');
  if (iw !== VP.w) { row.error = `innerWidth ${iw}, asked for ${VP.w}: the run is void`; return row; }
  let state = await waitSettled(s);
  if (state === null) { row.error = 'the shared screen never mounted/settled within the cap'; return row; }
  if (state !== 'open') {
    // Opened through the chrome's own event, the trigger a player's edit control uses, never past it.
    await s.ev(`document.dispatchEvent(new CustomEvent('watduang:edit-players')); return true;`);
    row.openedBy = 'edit-event';
    const t0 = Date.now();
    while (state !== 'open' && Date.now() - t0 < SETTLE_CAP_MS) { await s.sleep(100); state = await waitSettled(s); }
    if (state !== 'open') { row.error = `the shared screen did not open (state ${state})`; return row; }
  }
  row.rootId = await s.ev(`return document.querySelector('.ps')?.id || null`);
  if (!row.rootId) { row.error = 'the mount root (.ps) has no id, so the root pass has nothing to name'; return row; }
  const typed = await s.ev(TYPE_NAMES(NAME_THAI, NAME_LATIN));
  if (!typed.ok) { row.error = `fewer than two name fields (${typed.fields}); the names could not be typed`; return row; }
  await s.sleep(400);

  const grab = async (pass, key, rootSel, withPlatform) => {
    const spec = STATES.find((x) => x.key === key);
    const walk = await s.ev(walkExpr(rootSel, spec.anchors));
    if (withPlatform) await platformFonts(s, walk.rows);
    row.passes[pass][key] = walk;
  };
  const DIALOGS = [['reset', 'ps-reset-dialog'], ['edit', 'ps-edit-dialog']];
  const grabDialogs = async (pass, withPlatform) => {
    for (const [key, dlg] of DIALOGS) {
      const shown = await s.ev(SHOW_DIALOG(dlg));
      if (!shown.opened) { row.error = `${dlg} did not open through showModal (${shown.why ?? 'not open'})`; return false; }
      await s.sleep(300);
      await grab(pass, key, `#${dlg}`, withPlatform);
      await s.ev(CLOSE_DIALOG(dlg));
    }
    return true;
  };
  const inject = (css) => s.ev(INJECT(css));
  const remove = () => s.ev(REMOVE);

  // Pass 1, clean: nothing injected.
  await grab('clean', 'screen', '.ps', true);
  // A duplicate name raises the limit line, a text-bearing element the plain screen does not show. It
  // stays typed for every later pass, so the root pass sees the same screen the clean one did.
  await s.ev(`const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const f = document.querySelectorAll('.ps-n'); set.call(f[1], f[0].value); f[1].dispatchEvent(new Event('input', { bubbles: true })); return true;`);
  await s.sleep(500);
  await grab('clean', 'limit', '.ps', true);
  if (!(await grabDialogs('clean', true))) return row;
  // Taken after every state has painted: a face whose first use was in a dialog loads only then.
  row.fontReport = await s.ev(FAMILIES);
  row.allowed = row.fontReport.loaded;

  // The gameplay hold, read while the player screen is open and before any handover.
  const held = await s.ev(HOLD_READ);
  row.hold = { read: held, faults: holdFaults(declared, held), hostile: null };
  row.hold.missing = holdMissing(declared, held).map((root) => ({ root, status: 'missing (no WebGL)' }));
  const lifted = declared.find((k) => k.startsWith('#') && held.roots.some((r) => rootKey(r) === k));
  if (!lifted) row.hold.hostile = { error: `none of the declared gameplay roots present in the DOM (${declared.join(', ')}) has an id, so the lift has nothing to name` };
  else {
    const liftId = lifted.slice(1);
    await inject(`#${liftId} { visibility: visible !important }`);
    const seen = await s.ev(VISIBILITY_OF(liftId));
    await remove();
    const after = await s.ev(VISIBILITY_OF(liftId));
    row.hold.hostile = { root: lifted, firstDeclaredHadId: lifted === declared[0], webgl: held.webgl, visibleUnderLift: seen, afterRemoval: after, miss: holdHostileMiss(liftId, seen) };
  }

  // Which element really is the screen root, read from the browser. The static gate cannot tell: it reads
  // the route's markup, and the element mountPlayerScreen gives the `ps` class is the one it is handed.
  const declaredMount = declaredMountRoots(game);
  const psRead = await s.ev(PS_ROOT_READ);
  row.psRoot = { declaredMount, read: psRead, faults: psRootFaults(declaredMount, psRead), hostile: null };
  const moved = await s.ev(PS_MOVE_IN);
  if (!moved) row.psRoot.hostile = { error: 'no gameplay root exists that the screen root could be moved into' };
  else {
    const movedRead = await s.ev(PS_ROOT_READ);
    const back = await s.ev(PS_MOVE_BACK);
    const restoredRead = await s.ev(PS_ROOT_READ);
    const movedFaults = psRootFaults(declaredMount, movedRead);
    row.psRoot.hostile = { into: moved, movedRead, redOnAncestor: movedFaults.some((f) => f.includes('sits inside a gameplay root')), movedFaults, restored: back, restoredInsideGameplayRoot: restoredRead.insideGameplayRoot };
  }

  // Pass 2, root: the sheet goes in, the in-flow region is read again, the sheet comes out.
  await inject(HOSTILE_PASSES.root.css(row.rootId));
  await s.sleep(300);
  await grab('root', 'screen', '.ps', false);
  await grab('root', 'limit', '.ps', false);
  await remove();
  // Pass 3, dialog: same shape over both dialogs.
  await inject(HOSTILE_PASSES.dialog.css());
  await s.sleep(300);
  const ok = await grabDialogs('dialog', false);
  await remove();
  if (!ok) return row;
  // The sheets must really be gone, or a later route-level read would be judging the hostile face.
  const left = await s.ev(`return document.querySelectorAll('#probe-hostile').length`);
  if (left) row.error = `${left} hostile stylesheet(s) still in the document after the passes`;
  // Last, because it ends the player screen: press start and read the roots once the hold lifts. Reported
  // only; the route's own handover decides what it shows and a failed press is not a hold fault.
  try {
    await s.ev(TYPE_NAMES(NAME_THAI, NAME_LATIN)); // undo the duplicate, which disables start
    await s.sleep(400);
    const h = await s.ev(HANDOVER);
    await s.sleep(500);
    row.hold.afterHandover = { ...h, read: h.pressed ? await s.ev(HOLD_READ) : null };
  } catch (e) { row.hold.afterHandover = { pressed: false, error: e.message }; }
  return row;
}

/** Whole-run summary line for one row. */
const rowLine = (r) => `${r.route}: ${r.error ? 'ERROR ' + r.error : `psroot=${r.psRoot?.read.id ?? r.psRoot?.read.tag} hold[declared=${r.declared?.length} matched=${r.hold?.read.count} webgl=${r.hold?.read.webgl}${r.hold?.missing?.length ? ' ' + r.hold.missing.map((m) => `${m.root}: ${m.status}`).join(', ') : ''}] ` + Object.entries(r.passes).map(([p, st]) => `${p}[${Object.entries(st).map(([k, w]) => `${k}=${w.rows.length}`).join(' ')}]`).join(' ')}`;

async function main() {
  if (!fs.existsSync(path.join(repoRoot, 'dist/index.html'))) { console.error('::error::dist/index.html not found -- this leg measures an existing build and must never make one'); process.exit(1); }
  const routes = partyPlayRoutes();
  const narrowed = Boolean(process.env.ROUTES_ONLY?.trim());
  const s = await openSession(CDP_PORT).catch((e) => { console.error(`::error::${e.message}. Serve dist/ on ${BASE} and start Chrome with --remote-debugging-port=${CDP_PORT} first.`); process.exit(1); });
  const rows = [];
  const t0 = Date.now();
  try {
    for (const id of routes) {
      let row;
      try { row = await walkRoute(s, id); } catch (e) { row = { route: id, error: `walk threw: ${e.message}`, passes: { clean: {}, root: {}, dialog: {} } }; }
      rows.push(row);
      console.log(rowLine(row));
    }
  } finally {
    await s.close();
  }

  const bad = [];
  for (const r of rows) {
    if (r.error) { bad.push(`${r.route}: ${r.error}`); continue; }
    if (!r.allowed?.length) { bad.push(`${r.route}: no self-hosted family was loaded after fonts.ready, so there is nothing to grade against`); continue; }
    r.faults = STATES.flatMap((spec) => stateFaults(spec, r.passes.clean[spec.key], r.allowed));
    for (const f of r.faults) bad.push(`${r.route}: clean pass: ${f}`);
    for (const f of r.hold.faults) bad.push(`${r.route}: ${f}`);
    if (r.hold.hostile.error) bad.push(`${r.route}: hold pass cannot run its hostile lift: ${r.hold.hostile.error}`);
    else if (r.hold.hostile.miss) bad.push(`${r.route}: hold pass stayed green -- the probe is blind to it: ${r.hold.hostile.miss}`);
    for (const f of r.psRoot.faults) bad.push(`${r.route}: ${f}`);
    const ph = r.psRoot.hostile;
    if (ph.error) bad.push(`${r.route}: ps root pass cannot run its hostile move: ${ph.error}`);
    else {
      if (!ph.redOnAncestor) bad.push(`${r.route}: ps root pass stayed green -- the probe is blind to it: the screen root moved into gameplay root ${ph.into.tag}${ph.into.id ? '#' + ph.into.id : ''} and the read did not red on the ancestor check (${ph.movedFaults.join('; ') || 'no fault'})`);
      if (!ph.restored || ph.restoredInsideGameplayRoot) bad.push(`${r.route}: ps root pass did not put the screen root back where it was`);
    }
    r.misses = {};
    for (const [name, pass] of Object.entries(HOSTILE_PASSES)) {
      // The region must still have been walked, and the injection must have shown in it.
      const floor = pass.expect.flatMap((k) => floorFaults(STATES.find((x) => x.key === k), r.passes[name][k]));
      const miss = hostileMiss(pass, r.passes[name], r.allowed);
      r.misses[name] = [...floor, ...(miss ? [miss] : [])];
      for (const m of r.misses[name]) bad.push(`${r.route}: ${name} pass stayed green -- the probe is blind to it: ${m}`);
    }
  }
  if (rows.length !== routes.length) bad.push(`${rows.length} row(s) for ${routes.length} route(s)`);

  const graded = (pass) => rows.reduce((a, r) => a + Object.values(r.passes[pass]).reduce((b, w) => b + w.rows.length, 0), 0);
  const artifact = (leg) => ({
    probe: 'player-screen-face-probe', leg, base: BASE, viewport: `${VP.w}x${VP.h}`,
    chromeFlags: process.env.CHROME_FLAGS || null, routes, routeCount: routes.length, narrowed, n: graded(leg),
    verdict: bad.length ? 'RED' : 'GREEN', problems: bad,
    rows: rows.map((r) => ({ route: r.route, rootId: r.rootId, openedBy: r.openedBy, error: r.error, allowed: r.allowed, fontReport: r.fontReport, states: r.passes[leg], faults: leg === 'clean' ? r.faults : r.misses?.[leg] })),
  });
  if (process.env.PROBE_HOLD_ARTIFACT_DIR) {
    fs.mkdirSync(process.env.PROBE_HOLD_ARTIFACT_DIR, { recursive: true });
    const holdRows = rows.map((r) => ({ route: r.route, declared: r.declared, matched: r.hold?.read?.count ?? null, error: r.error, hold: r.hold, psRoot: r.psRoot }));
    fs.writeFileSync(path.join(process.env.PROBE_HOLD_ARTIFACT_DIR, 'hold.json'), JSON.stringify({
      probe: 'player-screen-face-probe', leg: 'hold', base: BASE, viewport: `${VP.w}x${VP.h}`, chromeFlags: process.env.CHROME_FLAGS || null,
      routes, routeCount: routes.length, narrowed, verdict: bad.length ? 'RED' : 'GREEN', problems: bad, rows: holdRows,
    }, null, 1));
  }
  if (process.env.PROBE_ARTIFACT_DIR) {
    fs.mkdirSync(process.env.PROBE_ARTIFACT_DIR, { recursive: true });
    for (const leg of ['clean', 'root', 'dialog']) fs.writeFileSync(path.join(process.env.PROBE_ARTIFACT_DIR, `${leg}.json`), JSON.stringify(artifact(leg), null, 1));
  }
  if (narrowed) console.log(`NARROWED by ROUTES_ONLY=${process.env.ROUTES_ONLY} -- ${routes.length} of ${games.filter((g) => g.playRoute && g.category === 'party').length} party play route(s). This is a debug run, not a gate.`);
  for (const b of bad) console.error(`::error::${b}`);
  if (bad.length) process.exit(1);
  console.log(`OK ${routes.length} party play route(s) in ${Math.round((Date.now() - t0) / 1000)}s: clean pass graded ${graded('clean')} row(s) across the shared screen and both dialogs, every first computed family a loaded self-hosted face; root pass reds the in-flow rows (${HOSTILE_PASSES.root.why}); dialog pass reds every one of ${graded('dialog')} dialog row(s) (${HOSTILE_PASSES.dialog.why}). Hold pass: ${rows.reduce((a, r) => a + r.hold.read.count, 0)} gameplay root(s) matched ${rows.reduce((a, r) => a + r.declared.length, 0)} declared across the routes, every one hidden / opacity 0 / pointer-events none, and a lifted root read visible on every route. Platform fonts reported per row, not graded.`);
}

const isEntryPoint = () => {
  if (!process.argv[1]) return false;
  const canonical = (p) => pathToFileURL(fs.realpathSync(p)).href;
  try { return canonical(process.argv[1]) === canonical(fileURLToPath(import.meta.url)); } catch { return true; }
};
if (isEntryPoint()) await main();
