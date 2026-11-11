#!/usr/bin/env node
// gh#302 render + check. Attaches to a headless Chrome already listening on CDP_PORT (default 9333),
// opens each board from file:// at a 1600px page width, waits for document.fonts.ready, then ASSERTS
// (every line below fails the run, exit 1):
//   - console: Runtime.exceptionThrown, console.error, and Log.entryAdded at level error (a failed resource
//     load lands only there); the one inherited design/support.js load failure is reported, not counted
//   - fonts: the four self-hosted faces (Sarabun 400/700, Mitr 600/700) present and every FontFace "loaded"
//   - frame matrix: every expected data-frame exists exactly once per direction it is drawn in
//   - per frame: no overflow; no control label wrapping; every tap control >= 44px on both axes;
//     every text >= the board's minimum (MIN_FONT) unless it is a name with its own stated floor;
//     on a phone frame, the primary button's bottom edge at or above the frame's data-fold
//   - names (.nm, .chip) and must-fit strings (.fits): no clipping; one line with 2% slack, or (data-wrap="2")
//     exactly at the floor on at most two lines; a typed field (data-fit="scroll") is judged on its floor only;
//     never below data-floor; every keyed name reports the size it fits at (nameFit)
//   - rendered text (innerText per frame and for the whole board, read after fonts load): no letter or mark
//     outside ASCII and U+0E00-U+0E7F, no invisible character or U+25CC, no word gh#299 bars (thai-scan.mjs)
//   - values (the picked direction, named by data-pick): every element of a picked frame and its ::before/::after
//     renders only values allowed by a VALUES role whose selector it matches; an element with a design value and no
//     role fails; a pseudo-element with any content other than "" fails; a <template> on the board fails
//   - field counts: chips, passed and not passed in each projector field equal the frame's data-expect-* figures
// Then, unless CHECK_ONLY=1: slices the full page (<=2000px, cut lines cross no frame) into <Board>-<n>.jpg,
// or with FRAME_SHOTS="B/proj-code,A/reveal-code-320" writes only those frames at authored size.
// Usage: SHOT_TMP=<scratch dir> node render-boards.mjs <board.dc.html> [...]

import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scanText } from './thai-scan.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.CDP_PORT || 9333;
const CHECK_ONLY = process.env.CHECK_ONLY === '1';
const FRAME_SHOTS = (process.env.FRAME_SHOTS ?? '').split(',').filter(Boolean);
const SHOT_TMP = process.env.SHOT_TMP;
if ((!CHECK_ONLY || FRAME_SHOTS.length) && !SHOT_TMP) { console.error('SHOT_TMP must name a scratch dir outside the repo'); process.exit(2); }
const WIDTH = 1600;
const SLICE = 2000;
const MIN_TAP = 44; // --tap-min
const MIN_FONT = { Gh302Setup: 16, Gh302Projector: 30, Gh302Phone: 16 }; // the boards' stated text minimums
const FACES = ['Sarabun 400', 'Sarabun 700', 'Mitr 600', 'Mitr 700'];

// 'id' is drawn in A and B; 'A:id' or 'B:id' in that direction only.
const EXPECT = {
  Gh302Setup: ['setup-admin', 'setup-qr', 'setup-schedule-error'],
  Gh302Projector: ['proj-lobby', 'proj-round', 'proj-reveal', 'proj-code', 'proj-result', 'B:proj-code-card'],
  Gh302Phone: [
    ...['pin', 'name', 'taken', 'device'].flatMap((s) => [`join-${s}-320`, `join-${s}-375`]),
    ...['code', 'wrong', 'pass', 'out', 'card'].map((s) => `reveal-${s}-320`), 'claim-320',
    'A:reveal-code-card-320', 'A:join-name-320-thai', 'A:join-device-320-thai', 'A:reveal-pass-320-thai', 'A:claim-320-thai',
  ],
};

const api = async (p, method = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method })).json();

const PROBE = `(async () => {
  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 400));
  const de = document.documentElement;
  const fonts = [...document.fonts].map((f) => ({ face: f.family.replace(/["']/g, '') + ' ' + f.weight, status: f.status }));
  const pick = document.querySelector('[data-pick]')?.dataset.pick ?? null;
  const hex = (c) => c.replace(/rgba?\\((\\d+), (\\d+), (\\d+)(?:, ([\\d.]+))?\\)/g, (_, r, g, b, a) => a == null || a === '1'
    ? '#' + [r, g, b].map((x) => Number(x).toString(16).padStart(2, '0')).join('') : 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')');
  const lineCount = (c, scale) => { const rg = document.createRange(); rg.selectNodeContents(c); const tops = [...rg.getClientRects()].map((x) => x.top).sort((p, q) => p - q);
    let n = 0, last = -1e9; for (const t of tops) { if (t - last > 8 * scale) n++; last = t; } return n; };
  // A role's selector list is used whole (Element.matches takes a list). A row whose selectors all end in ::before or
  // ::after is a pseudo-element role (do not mix the two in one row).
  const roles = [...document.querySelectorAll('[data-values-dir="' + pick + '"] tr[data-sel]')].map((tr) => {
    const sel = tr.dataset.sel.trim(); const m = sel.match(/(::before|::after)$/);
    return { role: tr.cells[0].textContent, sel: m ? sel.replaceAll(m[1], '') : sel, pseudo: m ? m[1] : null, tokens: tr.dataset.v.split('|') };
  });
  const frames = [...document.querySelectorAll('[data-frame]')].map((e) => {
    const r = e.getBoundingClientRect();
    const scale = r.width / e.offsetWidth;
    const all = [...e.querySelectorAll('*')].filter((c) => !c.closest('.fold, .stub'));
    const over = all.filter((c) => { const cr = c.getBoundingClientRect(); return cr.width > 0 && (cr.right > r.right + 0.5 || cr.left < r.left - 0.5); }).length;
    const spill = [...e.querySelectorAll('.tap, .btn, .go, .btn2, .seg > span, .del')].filter((c) => lineCount(c, scale) > 1).map((c) => c.textContent.trim());
    const taps = [...e.querySelectorAll('.tap')].map((c) => { const cr = c.getBoundingClientRect(); return { t: c.textContent.trim().slice(0, 20), px: Math.round(Math.min(cr.width, cr.height) / scale * 10) / 10 }; });
    // Text sizes: every element that owns a text node. Names with a stated floor are judged against it instead.
    const texts = all.filter((c) => [...c.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      .map((c) => ({ t: c.textContent.trim().slice(0, 24), px: parseFloat(getComputedStyle(c).fontSize), floor: c.closest('[data-floor]')?.dataset.floor ?? null }));
    // Names and must-fit strings.
    const names = [...e.querySelectorAll('.nm, .chip, .fits')].map((c) => {
      const cs = getComputedStyle(c); const fs = parseFloat(cs.fontSize);
      const rg = document.createRange(); rg.selectNodeContents(c); const rects = [...rg.getClientRects()].filter((x) => x.width > 0);
      const nl = lineCount(c, scale);
      // one line: its extent; wrapped: the lines laid end to end (names hold one text node, so no rect is counted twice)
      const textW = !rects.length ? 0 : (nl > 1 ? rects.reduce((a, x) => a + x.width, 0) : Math.max(...rects.map((x) => x.right)) - Math.min(...rects.map((x) => x.left))) / scale;
      const pad = (s) => parseFloat(s.paddingLeft) + parseFloat(s.paddingRight);
      const box = c.dataset.fit === 'line' ? c.parentElement : c;
      const bcs = getComputedStyle(box);
      const avail = box.clientWidth - pad(bcs) - (box === c ? 0 : pad(cs));
      const multi = c.dataset.fit === 'multi';
      const scroll = c.dataset.fit === 'scroll'; // a typed field: it scrolls, so only its floor is judged
      const wrap2 = c.dataset.wrap === '2'; // the rule's last step: at its floor, two lines
      const cr = c.getBoundingClientRect();
      // N3: the name's box must sit inside its parent and inside every clipping ancestor up to the frame, on both axes
      let outside = null;
      for (let a = c.parentElement; a; a = a.parentElement) {
        const as = getComputedStyle(a);
        if (a === c.parentElement || as.overflowX !== 'visible' || as.overflowY !== 'visible') {
          const ar = a.getBoundingClientRect();
          if (cr.left < ar.left - 1 || cr.right > ar.right + 1 || cr.top < ar.top - 1 || cr.bottom > ar.bottom + 1) { outside = (a.className?.baseVal ?? a.className) || a.tagName; break; }
        }
        if (a === e) break;
      }
      return { t: c.textContent.slice(0, 16), key: c.dataset.key ?? null, fs, floor: c.dataset.floor ? Number(c.dataset.floor) : null,
        outside,
        clips: !scroll && (c.scrollWidth > c.clientWidth + 0.5
          // vertical, for a name the rule wraps inside a box that hides overflow: a text content area (font ascent to
          // descent, not glyph ink) reaching outside the box. One-line names are judged horizontally only: their content
          // area overhangs a line-height of 1 by design and nothing is hidden.
          || (wrap2 && cs.overflowY === 'hidden' && rects.length > 0 && (Math.max(...rects.map((x) => x.bottom)) > cr.bottom + 1 || Math.min(...rects.map((x) => x.top)) < cr.top - 1))),
        wraps: !multi && !scroll && nl > (wrap2 ? 2 : 1), wrapBelow: wrap2 && fs !== Number(c.dataset.floor),
        slack: multi || scroll || wrap2 ? true : textW * 1.02 <= avail + 0.5,
        fit: multi || !textW ? null : Math.floor(fs * avail / (textW * 1.02)) };
    });
    // F3 (round 2): every element of a picked frame, and its ::before / ::after, against the ROLES of the VALUES table.
    const roleProblems = [];
    const styleTokens = (st, el, pseudo) => {
      const t = []; const add = (k, v) => t.push(k + ':' + hex(v).replace(/\\s+/g, ' ').trim());
      const ownText = pseudo ? false : [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (ownText) add('color', st.color);
      if (st.backgroundColor !== 'rgba(0, 0, 0, 0)') add('background-color', st.backgroundColor);
      if (st.backgroundImage !== 'none') add('background-image', st.backgroundImage);
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        if (st['border' + side + 'Style'] !== 'none' && parseFloat(st['border' + side + 'Width']) > 0) {
          add('border-width', st['border' + side + 'Width']); add('border-color', st['border' + side + 'Color']);
          if (st['border' + side + 'Style'] !== 'solid') add('border-style', st['border' + side + 'Style']);
        }
      }
      for (const k of ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']) if (st[k] !== '0px') add('radius', st[k]);
      if (st.boxShadow !== 'none') add('box-shadow', st.boxShadow);
      if (st.textShadow !== 'none' && ownText) add('text-shadow', st.textShadow);
      if (st.opacity !== '1') add('opacity', st.opacity);
      if (!pseudo && el instanceof SVGElement && !(el instanceof SVGSVGElement) && el.tagName !== 'g') { if (st.fill !== 'none') add('fill', st.fill); if (st.stroke !== 'none') add('stroke', st.stroke); }
      return [...new Set(t)];
    };
    if (pick && e.dataset.dir === pick) for (const c of [e, ...all]) {
      const desc = c.tagName.toLowerCase() + (c.classList.length ? '.' + [...c.classList].join('.') : '');
      // Text roles (only color / text-shadow tokens, e.g. the "*" default ink) grant text values only: a box value
      // (background, border, radius, shadow, opacity, paint) needs a role that names the element as a box.
      const isText = (x) => /^(color|text-shadow):/.test(x);
      const check = (tok, roleList, where) => {
        if (!tok.length) return;
        for (const [fam, want] of [['text', tok.filter(isText)], ['box', tok.filter((x) => !isText(x))]]) {
          if (!want.length) continue;
          const fit = roleList.filter((x) => fam === 'text' ? true : !x.tokens.every(isText));
          if (!fit.length) { roleProblems.push(where + ' matches no ' + fam + ' role yet renders ' + want.join(' ; ')); continue; }
          const allowed = new Set(fit.flatMap((x) => x.tokens));
          const miss = want.filter((x) => !allowed.has(x));
          if (miss.length) roleProblems.push(where + ' (roles: ' + fit.map((x) => x.role).join(', ') + ') renders ' + miss.join(' ; '));
        }
      };
      check(styleTokens(getComputedStyle(c), c, false), roles.filter((x) => !x.pseudo && c.matches(x.sel)), desc);
      for (const ps of ['::before', '::after']) {
        const st = getComputedStyle(c, ps);
        if (st.content === 'none' || st.content === 'normal') continue;
        if (st.content !== '""') roleProblems.push(desc + ps + ' carries content ' + st.content);
        check(styleTokens(st, c, true), roles.filter((x) => x.pseudo === ps && c.matches(x.sel)), desc + ps);
      }
    }
    // N2: the field holds exactly what the frame says it holds
    const stageChips = [...e.querySelectorAll('.stage .chip')];
    const counts = { chips: stageChips.length, in: stageChips.filter((x) => x.classList.contains('in')).length, out: stageChips.filter((x) => x.classList.contains('out')).length };
    const expect = { chips: e.dataset.expectChips, in: e.dataset.expectIn, out: e.dataset.expectOut };
    const btn = e.querySelector('.btn');
    return { id: e.dataset.frame, dir: e.dataset.dir, w: e.offsetWidth, h: e.offsetHeight, fold: e.dataset.fold ? Number(e.dataset.fold) : null,
      overflowY: e.scrollHeight > e.clientHeight + 0.5, overflowX: e.scrollWidth > e.clientWidth + 0.5, over, spill, taps, texts, names,
      btnBottom: btn ? Math.round((btn.getBoundingClientRect().bottom - r.top) / scale) : null, text: e.innerText, roleProblems, counts, expect,
      top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY) };
  });
  const nocut = [...document.querySelectorAll('[data-frame]')].filter((e) => e.getBoundingClientRect().height <= ${SLICE})
    .concat([...document.querySelectorAll('[data-frame] :is(.step, .ad-slot, .go, .panel, .h1, .lead, .stub)')])
    .map((e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY) }; });
  return { innerWidth, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, height: de.scrollHeight, nocut, pick, nRoles: roles.length,
    templates: document.querySelectorAll('template').length,
    bodyText: document.body.innerText, fonts, frames };
})()`;

async function run(file) {
  const abs = path.resolve(file);
  const board = path.basename(abs).replace(/\.dc\.html$/, '');
  const target = await api('/json/new?about:blank', 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = []; let loaded = null;
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Page.loadEventFired' && loaded) { loaded(); loaded = null; }
    if (m.method === 'Runtime.exceptionThrown') errors.push({ kind: 'exception', text: m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text });
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push({ kind: 'console.error', text: m.params.args?.map((a) => a.value ?? a.description).join(' ') });
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push({ kind: `log:${m.params.entry.source}`, text: `${m.params.entry.text} ${m.params.entry.url ?? ''}`.trim() });
  });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 1000, deviceScaleFactor: 1, mobile: false });
  const lp = new Promise((r) => { loaded = r; });
  await send('Page.navigate', { url: pathToFileURL(abs).href });
  await lp;
  const res = await send('Runtime.evaluate', { expression: PROBE, awaitPromise: true, returnByValue: true });
  const m = res.result?.result?.value;
  if (!m) throw new Error(`probe failed on ${board}: ${JSON.stringify(res.result?.exceptionDetails ?? res).slice(0, 400)}`);

  const problems = [];
  // fonts
  for (const face of FACES) {
    const got = m.fonts.filter((f) => f.face === face);
    if (!got.length) problems.push(`font ${face} not declared`);
    for (const f of got) if (f.status !== 'loaded') problems.push(`font ${face} status ${f.status}`);
  }
  for (const f of m.fonts) if (f.status !== 'loaded' && !FACES.includes(f.face)) problems.push(`font ${f.face} status ${f.status}`);
  // frame matrix
  for (const want of EXPECT[board] ?? []) {
    const [dirs, fid] = want.includes(':') ? [[want[0]], want.slice(2)] : [['A', 'B'], want];
    for (const dir of dirs) {
      const n = m.frames.filter((f) => f.id === fid && f.dir === dir).length;
      if (n !== 1) problems.push(`frame ${dir}/${fid} found ${n} times`);
    }
  }
  const minFont = MIN_FONT[board];
  const nameFit = [];
  for (const f of m.frames) {
    const at = `${f.dir}/${f.id}`;
    if (f.overflowX || f.overflowY || f.over) problems.push(`overflow in ${at}: x=${f.overflowX} y=${f.overflowY} children=${f.over}`);
    if (f.spill.length) problems.push(`control label wraps in ${at}: ${[...new Set(f.spill)].join(' | ')}`);
    for (const t of f.taps) if (t.px < MIN_TAP) problems.push(`tap control below ${MIN_TAP}px in ${at}: "${t.t}" ${t.px}px`);
    if (minFont) for (const t of f.texts) {
      if (t.floor != null) continue; // a name element: judged against its own floor below
      if (t.px < minFont) problems.push(`text below ${minFont}px in ${at}: "${t.t}" ${t.px}px`);
    }
    for (const n of f.names) {
      if (n.clips) problems.push(`name or code clips in ${at}: "${n.t}" at ${n.fs}px`);
      if (n.outside) problems.push(`name or code outside its parent or a clipping ancestor (${n.outside}) in ${at}: "${n.t}"`);
      if (n.wraps) problems.push(`name or code wraps (beyond what the rule allows) in ${at}: "${n.t}" at ${n.fs}px`);
      if (n.wrapBelow) problems.push(`name wraps above its floor in ${at}: "${n.t}" at ${n.fs}px (floor ${n.floor}px)`);
      if (!n.slack) problems.push(`name or code lacks 2% slack in ${at}: "${n.t}" at ${n.fs}px (fits at ${n.fit}px)`);
      if (n.floor != null && n.fs < n.floor) problems.push(`name below its floor in ${at}: "${n.t}" ${n.fs}px < ${n.floor}px`);
      if (n.key) nameFit.push({ at, key: n.key, fs: n.fs, fit: n.fit });
    }
    if (f.fold != null) {
      if (f.btnBottom == null) { if (f.id.startsWith('join-pin') || f.id.startsWith('join-name') || f.id.startsWith('join-taken') || f.id.includes('code') || f.id.includes('wrong')) problems.push(`primary button missing in ${at}`); }
      else if (f.btnBottom > f.fold) problems.push(`primary button below the fold in ${at}: bottom ${f.btnBottom}px > fold ${f.fold}px`);
    }
    const scan = scanText(f.text);
    if (!scan.ok) problems.push(`rendered text in ${at}: foreign ${scan.foreign.join(',') || 'none'}; barred ${scan.barred.join(' | ') || 'none'}`);
    for (const rp of f.roleProblems) problems.push(`values in ${at}: ${rp}`);
    for (const k of ['chips', 'in', 'out']) if (f.expect[k] != null && Number(f.expect[k]) !== f.counts[k]) problems.push(`field count in ${at}: ${k} ${f.counts[k]}, the frame says ${f.expect[k]}`);
  }
  if (m.pick && !m.nRoles) problems.push(`no VALUES roles found for the picked direction ${m.pick}`);
  if (m.templates) problems.push(`${m.templates} <template> element(s) on the board: their text escapes the rendered scan`);
  const bodyScan = scanText(m.bodyText);
  if (!bodyScan.ok) problems.push(`rendered board text: foreign ${bodyScan.foreign.join(',') || 'none'}; barred ${bodyScan.barred.join(' | ') || 'none'}`);
  if (m.innerWidth !== WIDTH) problems.push(`innerWidth ${m.innerWidth} != ${WIDTH}`);
  if (m.scrollWidth !== m.clientWidth) problems.push(`page scrolls sideways: ${m.scrollWidth} vs ${m.clientWidth}`);
  // Every board in design/ loads ./support.js, which the canvas tool supplies and the repo does not hold:
  // opened alone, each board logs exactly this one load failure (the control, Gh295Home, logs it too).
  const INHERITED = /ERR_FILE_NOT_FOUND file:\/\/\S*\/design\/support\.js$/;
  const inherited = errors.filter((e) => INHERITED.test(e.text));
  const consoleErrors = errors.filter((e) => !INHERITED.test(e.text));

  const slices = [];
  const frameShots = [];
  for (const want of FRAME_SHOTS) {
    const [dir, fid] = want.split('/');
    const box = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => { const e = document.querySelector('[data-frame="${fid}"][data-dir="${dir}"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, scale: e.offsetWidth / r.width }; })()` });
    const b = box.result?.result?.value;
    if (!b) continue;
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: b.x, y: b.y, width: b.w, height: b.h, scale: b.scale } });
    mkdirSync(SHOT_TMP, { recursive: true });
    const png = path.join(SHOT_TMP, `${board}-${fid}-${dir}.png`);
    writeFileSync(png, Buffer.from(shot.result.data, 'base64'));
    const out = path.join(here, `${board}-${fid}-${dir}.jpg`);
    execFileSync('magick', [png, '-strip', '-quality', '62', out]);
    frameShots.push(path.basename(out));
  }
  if (!CHECK_ONLY && !FRAME_SHOTS.length && (EXPECT[board] ?? []).length) {
    await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: m.height, deviceScaleFactor: 1, mobile: false });
    await new Promise((r) => setTimeout(r, 600));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(SHOT_TMP, { recursive: true });
    const png = path.join(SHOT_TMP, `${board}-full.png`);
    writeFileSync(png, Buffer.from(shot.result.data, 'base64'));
    const H = m.height; const cuts = [0];
    while (cuts.at(-1) < H) {
      const s = cuts.at(-1); let y = Math.min(s + SLICE, H);
      if (y < H && H - y < 300) y = H - 300;
      if (y < H) {
        let ok = y;
        for (; ok > s + 300; ok--) if (!m.nocut.some((f) => f.top < ok && ok < f.bottom)) break;
        y = ok > s + 300 ? ok : y;
      }
      cuts.push(y);
    }
    for (let i = 0; i + 1 < cuts.length; i++) {
      const out = path.join(here, `${board}-${i + 1}.jpg`);
      execFileSync('magick', [png, '-crop', `${WIDTH}x${cuts[i + 1] - cuts[i]}+0+${cuts[i]}`, '+repage', '-strip', '-quality', '62', out]);
      slices.push({ file: path.basename(out), from: cuts[i], to: cuts[i + 1] });
    }
  }
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`); ws.close();
  return { board, file, height: m.height, pick: m.pick, fonts: m.fonts, consoleErrors, inherited: inherited.map((e) => e.text), problems, slices, frameShots, nameFit,
    frames: m.frames.map(({ id, dir, w, h, btnBottom, fold, taps, texts }) => ({ id, dir, w, h, btnBottom, fold,
      minTap: taps.length ? Math.min(...taps.map((t) => t.px)) : null,
      minText: texts.filter((t) => t.floor == null).length ? Math.min(...texts.filter((t) => t.floor == null).map((t) => t.px)) : null })) };
}

const reports = [];
for (const f of process.argv.slice(2)) reports.push(await run(f));
console.log(JSON.stringify(reports, null, 1));
const bad = reports.some((r) => r.problems.length || r.consoleErrors.length);
process.exit(bad ? 1 : 0);
