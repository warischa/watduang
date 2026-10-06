// Under-44 touch-target enumeration, 2026-10-06 (gh#263 item 1). Derived from the gh#262 audit probe
// (docs/verification/evidence/ui-audit-2026-10-06-gh262/ui-audit-probe.mjs, left untouched). That probe stores
// only the count and the first 8 under-44 rows; this one emits EVERY row, plus an effective box and a
// component key. Everything else of the old probe (contrast, fonts, CLS, LCP, EXTRAS) is dropped: not
// this ticket's question. Read-only: it changes no page.
//
// The `visible` and `label` helpers, the `targets` selector + filter, the w/h rounding and the
// `under44` predicate are the old probe's lines VERBATIM — the old probe owns the predicate. Only
// `targetEls` (the element list kept parallel to `targets`) and everything after `under44` is new.
//
//   npm run build && npx serve dist/ -l 4461
//   Chrome: --headless=new --no-sandbox --remote-debugging-port=9361 --user-data-dir=<fresh>
//   BASE=http://localhost:4461 CDP_PORT=9361 W=320  node scripts/driver.mjs <this file>
//   BASE=http://localhost:4461 CDP_PORT=9361 W=1440 node scripts/driver.mjs <this file>
const BASE = process.env.BASE || 'http://localhost:4410';
const W = Number(process.env.W || 320);
const PAGES = (process.env.PAGES || '/tools/,/tool/wheel/,/tool/draw/,/tool/team/,/tool/number/,/c/fortune/,/game/siamsi/,/game/daily-fortune/,/game/love-match/,/404.html,/').split(',');

const AUDIT = `
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0; };
  const label = (el) => (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter((c) => !c.startsWith('astro-')).slice(0, 2).join('.') : '') + ' "' + (el.textContent || '').trim().slice(0, 24) + '"');
  const targetEls = [...document.querySelectorAll('a, button, input, select, summary')].filter(visible);
  const targets = targetEls.map((el) => { const r = el.getBoundingClientRect(); return { el: label(el), w: Math.round(r.width), h: Math.round(r.height) }; });
  const under44 = targets.filter((t) => t.w < 44 || t.h < 44);

  // ---- new from here ----
  // Component key: the nearest ANCESTOR (never the target itself) that carries an id or a non-astro class,
  // written tag#id or tag.firstclass. The wrapper that names the block, not an unclassed li/ul/p in between.
  // Astro scoped styling is a data-astro-cid-* attribute here, not a class, so it names no component.
  const nameOf = (e) => { const cls = typeof e.className === 'string' ? e.className.split(' ').filter((c) => c && !c.startsWith('astro-')) : []; return e.tagName.toLowerCase() + (e.id ? '#' + e.id : cls.length ? '.' + cls[0] : ''); };
  const componentOf = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { if (e.id || (typeof e.className === 'string' && e.className.split(' ').some((c) => c && !c.startsWith('astro-')))) return nameOf(e); } return 'body'; };
  // Region: the nearest landmark-ish ancestor, so a row can be read at page level as well.
  const regionOf = (el) => { const e = el.parentElement && el.parentElement.closest('header, nav, main, footer, aside, section'); return e ? nameOf(e) : 'body'; };
  // Effective box: for an input, the rect of its wrapping label, else of its label[for]; first label wins.
  // Every other tag: the target's own rect.
  const effOf = (el, r) => {
    if (el.tagName !== 'INPUT') return { r, via: null, el: null };
    const lab = el.closest('label') || (el.labels && el.labels[0]) || null;
    return lab ? { r: lab.getBoundingClientRect(), via: lab.contains(el) ? 'wrapping-label' : 'label-for', el: lab } : { r, via: null, el: null };
  };
  const rows = [];
  targets.forEach((t, i) => {
    if (!(t.w < 44 || t.h < 44)) return;
    const el = targetEls[i]; const r = el.getBoundingClientRect(); const eff = effOf(el, r);
    const ew = Math.round(eff.r.width), eh = Math.round(eff.r.height);
    rows.push({
      el: t.el, path: location.pathname, vw: innerWidth, tag: el.tagName.toLowerCase(), id: el.id || null,
      classes: typeof el.className === 'string' ? el.className.split(' ').filter((c) => c && !c.startsWith('astro-')).join(' ') : '',
      href: el.getAttribute('href'), type: el.getAttribute('type'), text: (el.textContent || '').trim().slice(0, 24),
      w: t.w, h: t.h, effW: ew, effH: eh, effVia: eff.via, display: getComputedStyle(el).display,
      effDisplay: eff.el ? getComputedStyle(eff.el).display : null,
      component: componentOf(el), region: regionOf(el), underByEffective: ew < 44 || eh < 44,
    });
  });
  return {
    path: location.pathname, innerWidth,
    targets: targets.length, under44: under44.length, under44Sample: under44.slice(0, 8), under44Rows: rows,
  };
`;

export default async function (session) {
  await session.setWidth(W, W < 640 ? 640 : 900, W < 640);
  const pages = [];
  for (const p of PAGES) {
    await session.nav(`${BASE}${p}`);
    const r = await session.evaluate(AUDIT);
    pages.push(r.value ? r.value : { path: p, error: r.error });
  }
  await session.close();
  return { width: W, pages, consoleErrors: session.consoleErrors };
}
