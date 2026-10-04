// UI audit, 2026-10-04: the ui-ux-pro-max skill's rule set (references/quick-reference.md, priority
// 1-6) measured on the built site in a real browser, not read from the CSS. Read-only: it changes no
// page. Every number comes from getComputedStyle / getBoundingClientRect / PerformanceObserver.
//
//   npm run build && npx serve dist/ -l 4321
//   Chrome: --headless --disable-gpu --no-sandbox --remote-debugging-port=9222 --user-data-dir=<fresh>
//   W=320  node scripts/driver.mjs docs/verification/evidence/ui-audit-2026-10-04/ui-audit-probe.mjs
//   W=1440 node scripts/driver.mjs docs/verification/evidence/ui-audit-2026-10-04/ui-audit-probe.mjs
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
const BASE = process.env.BASE || 'http://localhost:4321';
const W = Number(process.env.W || 320);
const PAGES = (process.env.PAGES || '/,/c/party/,/c/fortune/,/tools/,/tool/wheel/,/game/siamsi/').split(',');

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

export default async function (session) {
  await session.setWidth(W, W < 640 ? 640 : 900, W < 640);
  const pages = [];
  for (const p of PAGES) {
    await session.nav(`${BASE}${p}`);
    const r = await session.evaluate(AUDIT);
    pages.push(r.value ?? { path: p, error: r.error });
  }
  await session.close();
  return { width: W, pages, consoleErrors: session.consoleErrors };
}
