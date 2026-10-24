// gh#288 Phase 0, 2026-10-24. Copied from ../ui-audit-2026-10-06-gh262/ui-audit-probe.mjs: the AUDIT and
// EXTRAS blocks are that file's VERBATIM, so every number compares with the gh#262 run. New here: the
// page set (adds /c/party/), a 390 width, an EXTRAS2 block (every under-44 row, canvas/WebGL contexts,
// the motion inventory, the ad slot box), and a raw-CDP runner (./cdp-lib.mjs) so reduced motion can
// be emulated (RM=1). Read-only: it changes no page.
//
//   npm run build && npx serve dist/ -l 4410
//   Chrome: --headless=new --disable-gpu --no-sandbox --remote-debugging-port=9310 --user-data-dir=<fresh>
//   CDP_PORT=9310 W=320 H=640 MOBILE=1 RM=0 OUT=<json> node <this file>
//
// Originally 2026-10-04: the ui-ux-pro-max skill's rule set (references/quick-reference.md, priority
// 1-6) measured on the built site in a real browser, not read from the CSS.
//
// What each rule counts, so a number is never read as more than it is:
//   color-contrast  — every element with its OWN visible text node: computed colour against the first
//                     ancestor background-color that is not transparent, alpha composited. Elements
//                     painted over a background-image are listed as unmeasured, never as passing.
//                     Large text = >= 24px, or >= 18.66px at weight >= 700 (WCAG). Threshold 4.5 / 3.
//   touch-target    — every visible a, button, input, select, summary: the rendered box. Reported
//                     against 44x44 (the skill's rule) and 24x24 (WCAG 2.2 AA web-target-size).
//   readable-font   — elements with own text below 12px, and below 16px (the skill's mobile body rule).
//   line-height     — p and li with own text whose computed line-height is below 1.5x the font size.
//   alt-text        — img with no alt attribute at all (alt="" is a deliberate decorative mark).
//   CLS / LCP       — buffered layout-shift sum and the LCP element, after a full scroll.
const BASE = process.env.BASE || 'http://localhost:4410';
const W = Number(process.env.W || 320);
const PAGES = (process.env.PAGES || '/tools/,/tool/wheel/,/tool/draw/,/tool/team/,/tool/number/,/c/fortune/,/c/party/,/game/siamsi/,/game/daily-fortune/,/game/love-match/,/404.html,/').split(',');
const H = Number(process.env.H || (W < 640 ? 640 : 900));
const MOBILE = process.env.MOBILE ? process.env.MOBILE === '1' : W < 640;
const RM = process.env.RM === '1';

const AUDIT = `
  const lum = (c) => { const v = c.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const parse = (s) => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0; };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
  const label = (el) => (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter((c) => !c.startsWith('astro-')).slice(0, 2).join('.') : '') + ' "' + (el.textContent || '').trim().slice(0, 24) + '"');
  const bgOf = (el) => {
    let layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !cs.backgroundImage.startsWith('radial-gradient') && !cs.backgroundImage.startsWith('repeating-linear')) return { image: true };
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255];
    for (const l of layers.reverse()) base = over(l, base);
    return { rgb: base };
  };
  const contrast = [], unmeasured = [], small12 = [], small16 = [], tightLines = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!ownText(el) || !visible(el)) continue;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    const fw = Number(cs.fontWeight) || 400;
    if (fs < 12) small12.push(label(el) + ' ' + fs + 'px');
    if (fs < 16) small16.push(fs);
    if ((el.tagName === 'P' || el.tagName === 'LI') && cs.lineHeight !== 'normal' && parseFloat(cs.lineHeight) / fs < 1.5) tightLines.push(label(el) + ' ' + (parseFloat(cs.lineHeight) / fs).toFixed(2));
    const bg = bgOf(el);
    if (bg.image) { unmeasured.push(label(el)); continue; }
    const fg = parse(cs.color);
    if (!fg) continue;
    const fgc = over(fg, bg.rgb);
    const a = lum(fgc), b = lum(bg.rgb);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need) contrast.push({ el: label(el), ratio: +ratio.toFixed(2), need, fs, fw, fg: cs.color });
  }
  const targets = [...document.querySelectorAll('a, button, input, select, summary')].filter(visible).map((el) => { const r = el.getBoundingClientRect(); return { el: label(el), w: Math.round(r.width), h: Math.round(r.height) }; });
  const under44 = targets.filter((t) => t.w < 44 || t.h < 44);
  const under24 = targets.filter((t) => t.w < 24 || t.h < 24);
  const noAlt = [...document.images].filter((i) => !i.hasAttribute('alt')).map((i) => i.getAttribute('src'));
  const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map((h) => Number(h.tagName[1]));
  const skips = heads.filter((h, i) => i > 0 && h > heads[i - 1] + 1).length;
  for (let y = 0; y <= document.documentElement.scrollHeight; y += innerHeight) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 200)); }
  scrollTo(0, 0);
  const shifts = await new Promise((res) => { let sum = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) sum += e.value; }).observe({ type: 'layout-shift', buffered: true }); setTimeout(() => res(sum), 300); });
  const lcp = await new Promise((res) => { let last = null; new PerformanceObserver((l) => { const es = l.getEntries(); last = es[es.length - 1]; }).observe({ type: 'largest-contentful-paint', buffered: true }); setTimeout(() => res(last ? { el: last.element ? label(last.element) : null, ms: Math.round(last.startTime), url: last.url || null } : null), 300); });
  return {
    path: location.pathname, innerWidth,
    lang: document.documentElement.lang, viewport: document.querySelector('meta[name=viewport]')?.content ?? null,
    contrastFails: contrast, contrastUnmeasured: unmeasured.length,
    textElements16: small16.length, under12: small12,
    tightLines: tightLines.length, tightLineSample: tightLines.slice(0, 5),
    targets: targets.length, under44: under44.length, under44Sample: under44.slice(0, 8), under24: under24,
    imgNoAlt: noAlt, headingSkips: skips, headings: heads.join(''),
    cls: +shifts.toFixed(4), lcp,
  };
`;


const EXTRAS = `
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const lab = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' "' + (el.textContent || '').trim().slice(0, 20) + '"';
  const fam = (el) => getComputedStyle(el).fontFamily;
  const out = {};
  out.hOverflowPx = document.documentElement.scrollWidth - innerWidth;
  out.fontVars = { display: getComputedStyle(document.body).getPropertyValue('--font-display').trim(), sans: getComputedStyle(document.body).getPropertyValue('--font-sans').trim(), bodyFamily: fam(document.body) };
  out.headings = [...document.querySelectorAll('h1,h2')].filter(vis).slice(0, 6).map((h) => ({ el: lab(h), family: fam(h), size: getComputedStyle(h).fontSize, weight: getComputedStyle(h).fontWeight }));
  out.fontFaces = [...document.fonts].map((f) => f.family.replace(/"/g, '') + ' ' + f.weight + ' ' + f.status);
  // Default-style detector: Chrome's UA button is bg rgb(239,239,239) with a 2px outset border and appearance auto.
  const isDefaultBtn = (cs) => cs.backgroundColor === 'rgb(239, 239, 239)' && /outset|solid/.test(cs.borderTopStyle) && parseFloat(cs.borderTopWidth) === 2 && cs.borderRadius === '0px';
  const btnInfo = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { el: lab(el), disabled: !!el.disabled, appearance: cs.appearance, bg: cs.backgroundColor, color: cs.color, border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor, radius: cs.borderRadius, family: cs.fontFamily, fontSize: cs.fontSize, w: Math.round(r.width), h: Math.round(r.height), uaDefault: isDefaultBtn(cs) }; };
  const btns = [...document.querySelectorAll('button')].filter(vis).map(btnInfo);
  out.buttons = btns;
  out.buttonsUaDefault = btns.filter((b) => b.uaDefault).length;
  const probeBtn = document.createElement('button'); probeBtn.textContent = 'control'; document.body.appendChild(probeBtn);
  out.buttonControlUnstyled = btnInfo(probeBtn); probeBtn.remove();
  const wr = document.querySelector('#wheel-result');
  if (wr) { const cs = getComputedStyle(wr); const r = wr.getBoundingClientRect(); out.wheelResult = { text: wr.textContent.trim(), textLen: wr.textContent.trim().length, w: Math.round(r.width), h: Math.round(r.height), display: cs.display, visibility: cs.visibility, opacity: cs.opacity, bg: cs.backgroundColor, border: cs.borderTopWidth + ' ' + cs.borderTopStyle, padding: cs.padding, boxShadow: cs.boxShadow, hidden: wr.hidden, ariaHidden: wr.getAttribute('aria-hidden'), className: wr.className.toString().replace(/astro-\\S+/g, '').trim() }; }
  // Thai mid-word breaks: segment each own text node into dictionary words; a word whose Range spans two line boxes is split mid-word.
  const seg = new Intl.Segmenter('th', { granularity: 'word' });
  const hasThai = /[\\u0E00-\\u0E7F]/;
  const split = []; let words = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement; if (!el || ['SCRIPT', 'STYLE'].includes(el.tagName) || !vis(el) || !hasThai.test(n.data)) continue;
    for (const s of seg.segment(n.data)) {
      if (!s.isWordLike || s.segment.length < 2) continue;
      words++;
      const rg = document.createRange(); rg.setStart(n, s.index); rg.setEnd(n, s.index + s.segment.length);
      const tops = [...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top));
      if (new Set(tops.map((t) => Math.round(t / 4))).size > 1) split.push({ word: s.segment, in: lab(el).slice(0, 30), ow: getComputedStyle(el).overflowWrap, wb: getComputedStyle(el).wordBreak });
    }
  }
  out.thaiWords = words; out.thaiMidWordBreaks = split.length; out.thaiMidWordSample = split.slice(0, 6);
  const tiles = [...document.querySelectorAll('.tile')].filter(vis);
  if (tiles.length) {
    const bodies = [...new Set(tiles.flatMap((t) => [...t.querySelectorAll('*')].filter((e) => [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && e.tagName !== 'H3' && !/^H/.test(e.tagName))))];
    out.tileBodies = bodies.slice(0, 40).map((e) => { const cs = getComputedStyle(e); return { el: lab(e), lineHeight: cs.lineHeight, fontSize: cs.fontSize, overflowWrap: cs.overflowWrap, wordBreak: cs.wordBreak }; });
    out.tileBodyLineHeightNormal = out.tileBodies.filter((b) => b.lineHeight === 'normal').length;
    out.tileBodyOverflowWrapAnywhere = out.tileBodies.filter((b) => b.overflowWrap === 'anywhere').length;
  }
  // 404 / unstyled context
  out.page = { title: document.title, bodyBg: getComputedStyle(document.body).backgroundColor, bodyColor: getComputedStyle(document.body).color, bodyMargin: getComputedStyle(document.body).margin, stylesheets: document.styleSheets.length, h1Size: document.querySelector('h1') ? getComputedStyle(document.querySelector('h1')).fontSize : null };
  return out;
`;

// New in this run. under44All: every row (gh#262 kept 8; the predicate is AUDIT's, box only, so a pseudo
// ::after hit area reads as its box — gh#263's hit-area probe owns that number). motion: every element
// whose computed transition or animation is non-zero, plus document.getAnimations() at idle.
const EXTRAS2 = `
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0; };
  const label = (el) => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter((c) => !c.startsWith('astro-')).slice(0, 2).join('.') : '') + ' "' + (el.textContent || '').trim().slice(0, 24) + '"');
  const out = {};
  out.under44All = [...document.querySelectorAll('a, button, input, select, summary')].filter(visible).map((el) => { const r = el.getBoundingClientRect(); return { el: label(el), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((t) => t.w < 44 || t.h < 44);
  out.canvases = [...document.querySelectorAll('canvas')].map((c) => ({ el: label(c), w: c.width, h: c.height }));
  out.reducedMotionMatches = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ms = (v) => Math.max(...v.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000)));
  const motion = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const t = ms(cs.transitionDuration), a = cs.animationName !== 'none' ? ms(cs.animationDuration) : 0;
    if (t > 0 || a > 0) motion.push({ el: label(el).slice(0, 60), transition: t > 0 ? cs.transitionProperty + ' ' + cs.transitionDuration : null, animation: a > 0 ? cs.animationName + ' ' + cs.animationDuration + ' x' + cs.animationIterationCount : null, visible: visible(el) });
    for (const pe of ['::before', '::after']) { const p = getComputedStyle(el, pe); if (p.content !== 'none' && p.animationName !== 'none') motion.push({ el: label(el).slice(0, 50) + pe, animation: p.animationName + ' ' + p.animationDuration + ' x' + p.animationIterationCount }); }
  }
  out.motion = motion;
  out.runningAnimations = document.getAnimations().map((an) => ({ type: an.constructor.name, name: an.animationName || an.transitionProperty || an.id || null, target: an.effect?.target ? label(an.effect.target).slice(0, 50) : null, state: an.playState }));
  let rmRules = 0, keyframes = 0;
  const walk = (rules) => { for (const r of rules) { if (r instanceof CSSMediaRule && /prefers-reduced-motion/.test(r.conditionText)) rmRules++; if (r instanceof CSSKeyframesRule) keyframes++; if (r.cssRules) walk(r.cssRules); } };
  for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch (e) {} }
  out.cssReducedMotionRules = rmRules; out.cssKeyframes = keyframes;
  out.adSlots = [...document.querySelectorAll('.ad-slot, ins.adsbygoogle')].map((ad) => ({ el: label(ad), visible: visible(ad), rect: (({ x, y, width, height }) => ({ x: Math.round(x), y: Math.round(y + scrollY), w: Math.round(width), h: Math.round(height) }))(ad.getBoundingClientRect()) }));
  out.docHeight = document.documentElement.scrollHeight;
  return out;
`;

export { AUDIT, EXTRAS, EXTRAS2 };

import { open } from './cdp-lib.mjs';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
// Runs only when executed directly; state-probe.mjs imports the three blocks above.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = await open();
  await s.setWidth(W, H, MOBILE);
  await s.reducedMotion(RM);
  const pages = [];
  for (const p of PAGES) {
    const navResult = await s.nav(`${BASE}${p}`);
    const r = await s.ev(AUDIT);
    const x = await s.ev(EXTRAS);
    const x2 = await s.ev(EXTRAS2);
    pages.push(r && !r.__error ? { ...r, navResult, extras: x, extras2: x2 } : { path: p, navResult, error: r?.__error ?? 'null' });
  }
  await s.close();
  const result = { width: W, height: H, mobile: MOBILE, reducedMotion: RM, pages, consoleErrors: s.events };
  if (process.env.OUT) await writeFile(process.env.OUT, JSON.stringify(result, null, 1));
  console.log(JSON.stringify({ width: W, pages: pages.map((p) => ({ path: p.path, innerWidth: p.innerWidth, err: p.error ?? null, nav: p.navResult })), events: s.events.length }));
  process.exit(0);
}
