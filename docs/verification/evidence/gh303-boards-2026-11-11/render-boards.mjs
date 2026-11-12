#!/usr/bin/env node
// gh#303 render + check, adapted from the gh#302 one (a copy; it never writes into gh#302's directory).
// Attaches to a headless Chrome this run's operator launched on CDP_PORT (default 9334), opens each board from
// file:// at a 1600px page width, waits for document.fonts.ready and the board's fit script, then ASSERTS:
//   - console: no error other than the inherited missing design/support.js (exceptions, console.error, Log errors)
//   - frame matrix: every expected data-frame id exists exactly once per option (data-dir)
//   - fonts: all four self-hosted faces report status "loaded"
//   - per frame: no horizontal overflow; no clipped name or code (.chip, .fit, .plate, .digits, .card, .wn: the text's
//     Range wider than the content box); every .fit name keeps 2% slack on one line (gh#302 NAME FIT); no .fit below its data-min; no text below the board's font floor; no tap
//     target (.tap) under 44px
//   - one value per role: each (property, element) of a picked frame is owned by exactly ONE role row of the board's
//     VALUES BY ROLE table, and renders only that row's values (gh#303 REFUTE round 2: exclusive ownership)
//   - the closed authoring grammar of grammar.mjs: elements, attributes, CSS longhands and values of a picked frame
//   - the projector text floor read at the RENDERED size: computed font size x the scale of the transform chain up to
//     the frame (REFUTE round 2)
//   - rendered text (every text node, after fonts load and the fit script ran): no letter or mark outside ASCII and
//     U+0E00-U+0E7F, no U+25CC or invisible character, none of the words gh#299 bars. Reads the DOM, so markup
//     cannot split a word past it.
// Unless CHECK_ONLY=1: captures the page slice by slice (<=2000px, one clip each) as JPEG q62 next to this file.
// Usage: SHOT_TMP=<scratch dir> node render-boards.mjs <board.dc.html> [...]   Exit 1 on any failed assertion.

import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GRAMMAR } from './grammar.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.CDP_PORT || 9334;
const CHECK_ONLY = process.env.CHECK_ONLY === '1';
const SHOT_TMP = process.env.SHOT_TMP;
const OUT_DIR = process.env.OUT_DIR || here;
if (!CHECK_ONLY && !SHOT_TMP) { console.error('SHOT_TMP must name a scratch dir outside the repo'); process.exit(2); }
const WIDTH = 1600;
const SLICE = 2000;

const FW = ['fw-idle', 'fw-countdown', 'fw-reveal', 'fw-result', 'fw-rm', 'fwf-idle', 'fwf-reveal', 'fwf-result', 'fwf-rm'];
const CD = ['cd-idle', 'cd-rule', 'cd-reveal', 'cd-result', 'cd-rm'];
const LD = ['ld-idle', 'ld-reveal', 'ld-result', 'ld-rm'];
const EXPECT = {
  Gh303Fireworks: { A: FW, B: FW, F: ['fw-fallback', 'fwf-fallback'] },
  Gh303Cards: { A: CD, B: CD, F: ['cd-fallback', 'cd-code'] },
  Gh303Ladder: { A: LD, B: LD, F: ['ld-fallback', 'ld-few'] },
  'CatCompany-partyPop': { A: ['cat-1440', 'cat-event-1099', 'cat-event-320'], B: ['cat-1440'] },
  Gh303Home: { A: ['home-1440', 'home-320'], B: ['home-1440', 'home-320'] },
};
// Smallest non-name text allowed inside a picked frame, in px at the rendered size. Projector frames: 30px (names are judged by their
// own NAME FIT floor instead); site pages: 12px (the canvas D pages' smallest label, the ad-slot caption).
const FLOOR = { Gh303Fireworks: 30, Gh303Cards: 30, Gh303Ladder: 30, 'CatCompany-partyPop': 12, Gh303Home: 12 };
const BARRED = ['\u0e2b\u0e27\u0e22', '\u0e25\u0e2d\u0e15\u0e40\u0e15\u0e2d\u0e23\u0e35\u0e48', '\u0e40\u0e2a\u0e35\u0e48\u0e22\u0e07\u0e42\u0e0a\u0e04',
  '\u0e44\u0e1e\u0e48\u0e1b\u0e4a\u0e2d\u0e01', '\u0e41\u0e17\u0e07', '\u0e40\u0e14\u0e34\u0e21\u0e1e\u0e31\u0e19', '\u0e44\u0e2e\u0e42\u0e25'];

const api = async (p, method = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method })).json();

const PROBE = (floor) => `(async () => {
  // Load every declared face, used or not, so a missing or broken font file shows as status "error".
  await Promise.allSettled([...document.fonts].map((f) => f.load()));
  await document.fonts.ready;
  // Every image settles (loaded or failed) before anything is measured or captured.
  await Promise.all([...document.images].map((i) => i.complete ? null : new Promise((r) => { i.addEventListener('load', r); i.addEventListener('error', r); })));
  for (let i = 0; i < 50 && document.documentElement.dataset.fitDone !== '1'; i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 300));
  const de = document.documentElement;
  const fonts = [...document.fonts].map((f) => ({ name: f.family.replace(/["']/g, '') + ' ' + f.weight, status: f.status }));
  // The picked option, named by data-pick on the board; frames of that option and the shared frames (data-dir F) are
  // the design that code reads, and they are held to the role table and the projector text floor.
  const pick = document.querySelector('[data-pick]')?.dataset.pick ?? null;
  const picked = (e) => pick && (e.dataset.dir === pick || e.dataset.dir === 'F');
  // The rendered size of an element's text: its computed font size times the scale of every transform (and any zoom or
  // individual scale) between it and its frame. The frame's own 75% display scale is the board's, not the design's.
  const effScale = (c, fr) => { let k = 1; for (let a = c; a && a !== fr; a = a.parentElement) { const st = getComputedStyle(a);
    if (st.transform !== 'none') { const mt = new DOMMatrixReadOnly(st.transform); k *= Math.sqrt(Math.abs(mt.a * mt.d - mt.b * mt.c)); }
    if (st.scale && st.scale !== 'none') { const v = st.scale.split(' ').map(Number); k *= Math.sqrt(Math.abs(v[0] * (v[1] ?? v[0]))); }
    const z = parseFloat(st.zoom); if (z && z !== 1) k *= z; } return k; };
  const rendered = (c, fr) => parseFloat(getComputedStyle(c).fontSize) * effScale(c, fr);
  // The closed authoring grammar (grammar.mjs), over every picked frame: its elements, their attributes and inline
  // styles, every CSS rule that reaches one of them, and computed checks no authored list can hide from.
  const G = ${JSON.stringify(GRAMMAR)};
  const BANNED = new RegExp(G.banned);
  const pickedFrames = [...document.querySelectorAll('[data-frame]')].filter(picked);
  const grammar = new Set();
  const cssOk = (prop, val, where) => {
    if (!(prop in G.css)) return grammar.add(where + ': CSS ' + prop + ' is outside the grammar');
    if (BANNED.test(val)) return grammar.add(where + ': CSS ' + prop + ': ' + val + ' reaches outside the board');
    if (G.css[prop] && !new RegExp(G.css[prop]).test(val)) grammar.add(where + ': CSS ' + prop + ': ' + val + ' is outside the grammar');
  };
  for (const fr of pickedFrames) {
    const fk = fr.dataset.dir + '/' + fr.dataset.frame;
    for (const c of [fr, ...fr.querySelectorAll('*')]) {
      const isSvg = c instanceof SVGElement; const name = isSvg ? c.tagName : c.tagName.toLowerCase();
      if (!(isSvg ? G.svg : G.html).includes(name)) { grammar.add(fk + ': element <' + name + '> is outside the grammar'); continue; }
      const allowed = { ...G.attrs['*'], ...(G.attrs[name] ?? {}) };
      for (const a of c.attributes) {
        if (!(a.name in allowed)) grammar.add(fk + ': attribute ' + a.name + ' on <' + name + '> is outside the grammar');
        else if (allowed[a.name] && !new RegExp(allowed[a.name]).test(a.value)) grammar.add(fk + ': ' + name + ' ' + a.name + '="' + a.value.slice(0, 30) + '" is outside the grammar');
        else if (a.name !== 'style' && BANNED.test(a.value)) grammar.add(fk + ': ' + name + ' ' + a.name + ' reaches outside the board');
      }
      for (let i = 0; i < c.style.length; i++) cssOk(c.style[i], c.style.getPropertyValue(c.style[i]), fk + ' <' + name + ' style>');
      const st = getComputedStyle(c);
      const bad = [st.opacity !== '1' && 'opacity ' + st.opacity, st.fillOpacity !== '1' && 'fill-opacity ' + st.fillOpacity, st.strokeOpacity !== '1' && 'stroke-opacity ' + st.strokeOpacity,
        BANNED.test(st.fill + ' ' + st.stroke + ' ' + st.maskImage + ' ' + st.clipPath + ' ' + st.filter) && 'a url() paint, mask, clip or filter',
        st.filter !== 'none' && 'filter', st.mixBlendMode !== 'normal' && 'blend mode', st.display === 'list-item' && 'a list item (::marker)',
        st.zoom !== '1' && 'zoom', st.scale !== 'none' && 'scale', st.rotate !== 'none' && 'rotate', st.translate !== 'none' && 'translate',
        st.fontSizeAdjust !== 'none' && 'font-size-adjust', c !== fr && st.transform !== 'none' && c.textContent.trim() && 'a transform on an element that bears text'].filter(Boolean);
      for (const b of bad) grammar.add(fk + ': <' + name + (c.classList.length ? '.' + [...c.classList].join('.') : '') + '> computes ' + b);
    }
    for (let a = fr.parentElement; a; a = a.parentElement) { const st = getComputedStyle(a);
      if (st.opacity !== '1' || st.filter !== 'none' || st.mixBlendMode !== 'normal' || st.zoom !== '1' || st.maskImage !== 'none' || st.clipPath !== 'none') grammar.add(fk + ': an ancestor <' + a.tagName.toLowerCase() + '> fades, filters, masks or blends the frame'); }
  }
  const allRules = []; const walk = (rs) => { for (const r of rs) { if (r instanceof CSSStyleRule) allRules.push(r); if (r.cssRules && r.cssRules.length) walk(r.cssRules); } };
  for (const sh of document.styleSheets) walk(sh.cssRules);
  const splitSel = (t) => { const out = []; let d = 0, cur = ''; for (const ch of t) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  for (const r of allRules) for (const part of splitSel(r.selectorText)) {
    const pes = [...part.matchAll(/::([a-z-]+)|(?<!:):(before|after|first-line|first-letter)\\b/g)].map((x) => x[1] || x[2]);
    const base = part.replace(/::[a-z-]+(\\([^)]*\\))?|(?<!:):(before|after|first-line|first-letter)\\b/g, '').trim() || '*';
    let hit = []; try { hit = [...document.querySelectorAll(base)].filter((el) => pickedFrames.some((fr) => fr.contains(el))); } catch { hit = []; }
    if (!hit.length) continue;
    const where = 'rule ' + part.trim().slice(0, 60);
    for (const p of pes) if (!G.pseudo.includes(p)) grammar.add(where + ': pseudo-element ::' + p + ' is outside the grammar');
    for (let i = 0; i < r.style.length; i++) cssOk(r.style[i], r.style.getPropertyValue(r.style[i]), where);
  }
  const hex = (c) => c.replace(/rgba?\\((\\d+), (\\d+), (\\d+)(?:, ([\\d.]+))?\\)/g, (_, r, g, b, a) => a == null || a === '1'
    ? '#' + [r, g, b].map((x) => Number(x).toString(16).padStart(2, '0')).join('') : 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')');
  // gh#302's mechanism (its render-boards.mjs, F3): a role names its elements (a selector list) and the only values
  // they may render. A row whose selectors end in ::before or ::after is a pseudo-element role.
  const roles = [...document.querySelectorAll('[data-values-dir="' + pick + '"] tr[data-sel]')].map((tr) => {
    const sel = tr.dataset.sel.trim(); const m = sel.match(/(::before|::after)$/);
    return { role: tr.cells[0].textContent, sel: m ? sel.replaceAll(m[1], '') : sel, pseudo: m ? m[1] : null, tokens: tr.dataset.v.split('|') };
  });
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
    if (st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0) add('outline', st.outlineColor + ' ' + st.outlineWidth);
    for (const k of ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']) if (st[k] !== '0px') add('radius', st[k]);
    if (st.boxShadow !== 'none') add('box-shadow', st.boxShadow);
    if (st.textShadow !== 'none' && ownText) add('text-shadow', st.textShadow);
    if (st.opacity !== '1') add('opacity', st.opacity);
    if (!pseudo && el instanceof SVGElement && !(el instanceof SVGSVGElement) && el.tagName !== 'g') { if (st.fill !== 'none' && el.tagName !== 'line') add('fill', st.fill); /* a <line> paints no fill */ if (st.stroke !== 'none') add('stroke', st.stroke); }
    return [...new Set(t)];
  };
  const frames = [...document.querySelectorAll('[data-frame]')].map((e) => {
    const r = e.getBoundingClientRect();
    const scale = r.width / e.offsetWidth;
    const over = [...e.querySelectorAll('*')].filter((c) => { if (c.closest('svg') && c.tagName.toLowerCase() !== 'svg') return false; const cr = c.getBoundingClientRect(); return cr.width > 0 && (cr.right > r.right + 0.5 || cr.left < r.left - 0.5); }).map((c) => c.className.baseVal ?? c.className).slice(0, 5);
    // Clipped = the text's own extent (a Range) is wider than the element's content box. scrollWidth is blind here:
    // these boxes use overflow-x: clip (so Thai marks are never cut vertically), and a clip box has no scroll overflow.
    const tw = (c) => { const g = document.createRange(); g.selectNodeContents(c); const rs = [...g.getClientRects()].filter((x) => x.width > 0); return rs.length ? Math.max(...rs.map((x) => x.right)) - Math.min(...rs.map((x) => x.left)) : 0; };
    const cw = (c) => { const cs = getComputedStyle(c); return (c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * (c.getBoundingClientRect().width / c.offsetWidth); };
    const clipped = [...e.querySelectorAll('.chip, .fit, .plate, .digits, .card, .wn')].filter((c) => c.offsetWidth > 0 && tw(c) > cw(c) + 0.5).map((c) => c.textContent.trim());
    // The gh#302 NAME FIT slack: a name must fit its box with 2% to spare, on one line.
    // Lines from the text's rects: a new line starts where a rect's top is more than half the font size below the last.
    const lineCount = (c) => { const g = document.createRange(); g.selectNodeContents(c); const half = parseFloat(getComputedStyle(c).fontSize) * scale / 2; const tops = [...g.getClientRects()].filter((x) => x.width > 0).map((x) => x.top).sort((p, q) => p - q); let n = 0, last = -1e9; for (const t of tops) { if (t - last > half) n++; last = t; } return n; };
    // gh#302 NAME FIT: one line with 2% slack; two lines only at the floor; never three.
    const atFloor = (c) => parseFloat(getComputedStyle(c).fontSize) <= parseFloat(c.dataset.min) + 0.01;
    const noSlack = [...e.querySelectorAll('.fit')].filter((c) => c.offsetWidth > 0 && ((lineCount(c) === 1 && tw(c) * 1.02 > cw(c) + 0.25) || (lineCount(c) === 2 && !atFloor(c)) || lineCount(c) > 2)).map((c) => c.textContent.trim());
    // The floors are set so a name of 12 base letters (no U+0E33) stays on one line: only a SARA AM name may wrap.
    const baseWrapped = [...e.querySelectorAll('.fit')].filter((c) => c.offsetWidth > 0 && lineCount(c) > 1 && !c.textContent.includes('\\u0e33')).map((c) => c.textContent.trim());
    const wrapped = [...e.querySelectorAll('.fit')].filter((c) => c.offsetWidth > 0 && lineCount(c) === 2).map((c) => c.textContent.trim());
    // Name boxes placed by absolute position (plates, lane plates, slots, result cards, the code card) must not
    // overlap one another: frame overflow cannot see one box sitting on another.
    const boxes = [...e.querySelectorAll('.plate, .lplate, .slot, .wcard, .codebox, .rulecard, .hud1 > div, .hud2')].map((c) => ({ t: c.textContent.trim().slice(0, 24), r: c.getBoundingClientRect() }));
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i].r, b = boxes[j].r;
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) overlaps.push(boxes[i].t + ' / ' + boxes[j].t); }
    // A field whose rows (one grown by a wrapped name) no longer fit it.
    const fieldOver = [...e.querySelectorAll('.grid')].filter((g) => g.scrollHeight > g.clientHeight + 0.5).length;
    const underMin = [...e.querySelectorAll('.fit')].filter((c) => rendered(c, e) < parseFloat(c.dataset.min) - 0.01).map((c) => c.textContent);
    const texts = [...e.querySelectorAll('*')].filter((c) => [...c.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !c.closest('.stub'));
    // Non-name text of a picked frame: at least the board's floor (30px on the projector). A name is judged by its own
    // NAME FIT floor (data-min) instead; nothing else is exempt.
    const small = !picked(e) ? [] : texts.filter((c) => !c.closest('.fit') && rendered(c, e) < ${floor} - 0.01).map((c) => c.textContent.trim() + ' @' + rendered(c, e).toFixed(1) + 'px rendered (' + getComputedStyle(c).fontSize + ' x ' + effScale(c, e).toFixed(2) + ')');
    // Containment (gh#302 N3): a name's or code's box sits inside its parent and inside every clipping ancestor up to
    // the frame, on both axes.
    const outside = [];
    for (const c of e.querySelectorAll('.fit, .digits, .chip, .card, .plate, .lplate, .slot')) {
      if (!c.offsetWidth && !c.offsetHeight) continue;
      const cr = c.getBoundingClientRect();
      for (let a = c.parentElement; a; a = a.parentElement) {
        const as = getComputedStyle(a);
        if (a === c.parentElement || as.overflowX !== 'visible' || as.overflowY !== 'visible') {
          const ar = a.getBoundingClientRect();
          if (cr.left < ar.left - 1 || cr.right > ar.right + 1 || cr.top < ar.top - 1 || cr.bottom > ar.bottom + 1) { outside.push(c.textContent.trim().slice(0, 20) + ' in ' + ((a.className?.baseVal ?? a.className) || a.tagName)); break; }
        }
        if (a === e) break;
      }
    }
    // Every element of a picked frame, and its ::before / ::after, against the roles.
    const roleProblems = [];
    if (picked(e)) for (const c of [e, ...e.querySelectorAll('*')]) {
      if (c.closest('.stub, defs, symbol') || ['defs', 'linearGradient', 'stop', 'symbol'].includes(c.tagName)) continue;
      const desc = c.tagName.toLowerCase() + (c.classList.length ? '.' + [...c.classList].join('.') : '');
      // Exclusive ownership (REFUTE round 2): each property an element renders is owned by exactly one role row among
      // the rows that match it, and only that row's values may appear. No row, or two rows, fails.
      const propOf = (x) => x.slice(0, x.indexOf(':'));
      const check = (tok, roleList, where) => {
        for (const p of [...new Set(tok.map(propOf))]) {
          const want = tok.filter((x) => propOf(x) === p);
          const owners = roleList.filter((x) => x.tokens.some((t) => propOf(t) === p));
          if (!owners.length) { roleProblems.push(where + ' renders ' + want.join(' ; ') + ' but no role owns ' + p); continue; }
          if (owners.length > 1) { roleProblems.push(where + ': ' + p + ' is owned by ' + owners.length + ' roles (' + owners.map((x) => x.role).join(', ') + ')'); continue; }
          const miss = want.filter((x) => !owners[0].tokens.includes(x));
          if (miss.length) roleProblems.push(where + ' (role: ' + owners[0].role + ') renders ' + miss.join(' ; '));
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
    // The field holds what the frame says: data-expect="total/passed" on a judged field.
    const counts = [...e.querySelectorAll('[data-expect]')].map((g) => { const [n, p] = g.dataset.expect.split('/').map(Number); const kids = [...g.children];
      const pass = kids.filter((k) => k.matches('.in, .pass, .lit')).length; return kids.length === n && pass === p ? null : 'holds ' + kids.length + ' with ' + pass + ' passed, says ' + n + '/' + p; }).filter(Boolean);
    const minFont = texts.length ? Math.min(...texts.map((c) => rendered(c, e))) : null;
    const fitted = [...e.querySelectorAll('.fit')].filter((c) => parseFloat(getComputedStyle(c).fontSize) < parseFloat(c.dataset.max)).map((c) => c.textContent + ' @' + getComputedStyle(c).fontSize);
    const taps = [...e.querySelectorAll('.tap')].map((c) => { const cr = c.getBoundingClientRect(); return { t: c.textContent.trim(), px: Math.min(cr.width, cr.height) / scale }; });
    return { id: e.dataset.frame, dir: e.dataset.dir, w: e.offsetWidth, h: e.offsetHeight,
      overflowY: e.scrollHeight > e.clientHeight + 0.5, overflowX: e.scrollWidth > e.clientWidth + 0.5, over, overlaps, clipped, outside, roleProblems, counts, noSlack, baseWrapped, wrapped, fieldOver, underMin, small, minFont, fitted,
      smallTaps: taps.filter((x) => x.px < 44 - 0.01).map((x) => x.t + ' ' + x.px.toFixed(1)), minTap: taps.length ? Math.min(...taps.map((x) => x.px)) : null,
      top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY) };
  });
  // Rendered text, read node by node (hidden or not), so a word split across elements is read whole.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let text = ''; for (let n = walker.nextNode(); n; n = walker.nextNode()) { if (n.parentElement && n.parentElement.closest('script, style')) continue; text += n.data; }
  const flat = document.body.innerText;
  const nocut = [...document.querySelectorAll('[data-frame]')].filter((e) => e.getBoundingClientRect().height <= ${SLICE})
    .map((e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY) }; });
  return { innerWidth, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, height: de.scrollHeight, nocut, fonts, frames, text, flat, pick, nRoles: roles.length,
    templates: document.querySelectorAll('template').length, grammar: [...grammar],
    brokenImages: pickedFrames.flatMap((fr) => [...fr.querySelectorAll('img')].filter((i) => !i.complete || !i.naturalWidth).map((i) => fr.dataset.dir + '/' + fr.dataset.frame + ' ' + i.getAttribute('src'))) };
})()`;

function scanText(text) {
  const foreign = new Set(); let thai = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) continue;
    if (cp >= 0x0e00 && cp <= 0x0e7f) { thai++; continue; }
    if (/[\p{L}\p{M}]/u.test(ch) || /[\u200b-\u200d\u2060\ufeff\u25cc]/u.test(ch)) foreign.add(`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
  }
  // Barred words, read with every non-Thai character removed too, so markup or a stray space cannot split one.
  const squeezed = text.replace(/[^\u0e00-\u0e7f]/gu, '');
  const barred = BARRED.filter((w) => text.includes(w) || squeezed.includes(w)).map((w) => [...w].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(' '));
  return { thai, foreign: [...foreign], barred };
}

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
  const res = await send('Runtime.evaluate', { expression: PROBE(FLOOR[board] ?? 16), awaitPromise: true, returnByValue: true });
  const m = res.result?.result?.value;
  if (!m) throw new Error(`probe failed on ${board}: ${JSON.stringify(res.result?.exceptionDetails ?? res).slice(0, 400)}`);

  const problems = [];
  const expected = EXPECT[board];
  if (!expected) problems.push(`board ${board} has no expected frame list`);
  for (const [dir, ids] of Object.entries(expected ?? {})) for (const fid of ids) {
    const n = m.frames.filter((f) => f.id === fid && f.dir === dir).length;
    if (n !== 1) problems.push(`frame ${dir}/${fid} found ${n} times`);
  }
  const want = ['Sarabun 400', 'Sarabun 700', 'Mitr 600', 'Mitr 700'];
  for (const w of want) { const f = m.fonts.find((x) => x.name === w); if (!f || f.status !== 'loaded') problems.push(`font ${w} ${f ? f.status : 'missing'}`); }
  for (const f of m.frames) {
    const k = `${f.dir}/${f.id}`;
    if (f.overflowX || f.overflowY || f.over.length) problems.push(`overflow in ${k}: x=${f.overflowX} y=${f.overflowY} children=${f.over.join(',')}`);
    if (f.clipped.length) problems.push(`clipped in ${k}: ${[...new Set(f.clipped)].join(' | ')}`);
    if (f.noSlack.length) problems.push(`name breaks the NAME FIT rule (no slack on one line, two lines above its floor, or three lines) in ${k}: ${[...new Set(f.noSlack)].join(' | ')}`);
    if (f.baseWrapped.length) problems.push(`a 12-base-letter name wraps (its floor is too high) in ${k}: ${[...new Set(f.baseWrapped)].join(' | ')}`);
    if (f.overlaps.length) problems.push(`name boxes overlap in ${k}: ${f.overlaps.slice(0, 4).join(' | ')}`);
    if (f.fieldOver) problems.push(`name field overflows its box in ${k}`);
    if (f.outside.length) problems.push(`name or code outside its parent or a clipping ancestor in ${k}: ${f.outside.slice(0, 4).join(' | ')}`);
    for (const rp of f.roleProblems.slice(0, 6)) problems.push(`values in ${k}: ${rp}`);
    if (f.counts.length) problems.push(`field count in ${k}: ${f.counts.join(' | ')}`);
    if (f.underMin.length) problems.push(`fit below its floor in ${k}: ${f.underMin.join(' | ')}`);
    if (f.small.length) problems.push(`text under ${FLOOR[board] ?? 16}px in ${k}: ${[...new Set(f.small)].slice(0, 5).join(' | ')}`);
    if (f.smallTaps.length) problems.push(`tap under 44px in ${k}: ${f.smallTaps.join(' | ')}`);
  }
  if (!m.pick) problems.push('board names no picked option (data-pick)');
  if (m.pick && !m.nRoles) problems.push(`no VALUES roles for the picked option ${m.pick}`);
  for (const b of m.brokenImages) problems.push('image did not load in ' + b);
  for (const g of m.grammar.slice(0, 8)) problems.push('grammar: ' + g);
  if (m.grammar.length > 8) problems.push('grammar: ' + (m.grammar.length - 8) + ' more outside the grammar');
  if (m.templates) problems.push(`${m.templates} <template> element(s) on the board: their text escapes the rendered scan`);
  const scan = scanText(m.text);
  if (scan.foreign.length) problems.push(`rendered text: foreign letter/mark/invisible ${scan.foreign.join(',')}`);
  if (scan.barred.length) problems.push(`rendered text: barred word ${scan.barred.join(' | ')}`);
  if (m.innerWidth !== WIDTH) problems.push(`innerWidth ${m.innerWidth} != ${WIDTH}`);
  if (m.scrollWidth !== m.clientWidth) problems.push(`page scrolls sideways: ${m.scrollWidth} vs ${m.clientWidth}`);
  // Every board in design/ loads ./support.js, which the canvas tool supplies and the repo does not hold.
  const INHERITED = /ERR_FILE_NOT_FOUND file:\/\/\S*\/design\/support\.js$/;
  const inherited = errors.filter((e) => INHERITED.test(e.text));
  const consoleErrors = errors.filter((e) => !INHERITED.test(e.text));
  if (consoleErrors.length) problems.push(`console: ${consoleErrors.map((e) => e.kind + ' ' + e.text).join(' | ')}`);

  let slices = [];
  if (!CHECK_ONLY && expected) {
    await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: m.height, deviceScaleFactor: 1, mobile: false });
    await new Promise((r) => setTimeout(r, 600));
    mkdirSync(SHOT_TMP, { recursive: true });
    // Each slice is captured on its own clip: one full-page capture past about 16384px repeats the top of the page
    // (seen on this board's first renders), so a tall board is never taken in one shot.
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
      const out = path.join(OUT_DIR, `${board}-${i + 1}.jpg`);
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: cuts[i], width: WIDTH, height: cuts[i + 1] - cuts[i], scale: 1 } });
      const png = path.join(SHOT_TMP, `gh303-${board}-${i + 1}.png`);
      writeFileSync(png, Buffer.from(shot.result.data, 'base64'));
      execFileSync('magick', [png, '-strip', '-quality', '62', out]);
      slices.push({ file: path.basename(out), from: cuts[i], to: cuts[i + 1] });
    }
  }
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`); ws.close();
  return { board, height: m.height, fonts: m.fonts.map((f) => `${f.name} ${f.status}`), inherited: inherited.map((e) => e.text), thaiCodepoints: scan.thai, problems, slices,
    frames: m.frames.map(({ id, dir, minFont, minTap, fitted, wrapped }) => ({ id, dir, minFont, minTap, fitted: [...new Set(fitted)], wrapped: [...new Set(wrapped)] })) };
}

const reports = [];
for (const f of process.argv.slice(2)) reports.push(await run(f));
console.log(JSON.stringify(reports, null, 1));
const bad = reports.some((r) => r.problems.length);
for (const r of reports) console.error(`${r.problems.length ? 'FAIL' : 'ok'} ${r.board}: ${r.problems.length} problems, ${r.frames.length} frames, ${r.slices.length} slices, inherited ${r.inherited.length}`);
// exitCode, not exit(): exit() can cut a large report short when stdout is a pipe.
process.exitCode = bad ? 1 : 0;
