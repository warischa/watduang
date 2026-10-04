// gh#252 weight census: which computed font-weights the site's Mitr text actually uses.
//
// WHAT IT COUNTS: for every built page (enumerated from dist/ at run time, never listed by hand),
// every element in the document whose COMPUTED font-family starts with Mitr, grouped by COMPUTED
// font-weight. Two tallies per page, because they answer different questions:
//   all      — every element, including ones a stylesheet hides (display:none still computes a weight,
//              and the screen may be shown by a later state)
//   painted  — elements with their own non-empty text node that are laid out (a box, not display:none)
// ::before / ::after with generated content are counted in `all` and `painted` under the same rule.
// CEILING: a page is read once, after load and a settle, in its initial state. A weight set only by
// script in a later state (a result screen built after a spin) is not seen here; the census is
// therefore a floor, and the README names every weight the source sets by hand besides.
//
// Run, one width per fresh Chrome (CDP_PORT selects the endpoint, BASE the server):
//   W=320  CDP_PORT=9351 BASE=http://localhost:4351 node scripts/driver.mjs <this file>
//   W=1440 CDP_PORT=9351 BASE=http://localhost:4351 node scripts/driver.mjs <this file>
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:4351';
const W = Number(process.env.W || 320);
const DIST = process.env.DIST || 'dist';

function pages(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) out.push(...pages(dir, r));
    else if (e.name.endsWith('.html')) {
      const url = '/' + r.replace(/index\.html$/, '').replace(/\\/g, '/');
      out.push(url === '/404.html' ? '/404.html' : url);
    }
  }
  return out.sort();
}

const CENSUS = `
  const isMitr = (cs) => /^\\s*["']?Mitr\\b/i.test(cs.fontFamily);
  const all = {}, painted = {}, sample = {};
  const bump = (m, k) => { m[k] = (m[k] || 0) + 1; };
  const lab = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').filter((c) => !c.startsWith('astro-'))[0] : '');
  for (const el of document.querySelectorAll('body *, body')) {
    const cs = getComputedStyle(el);
    if (isMitr(cs)) {
      const w = cs.fontWeight;
      bump(all, w);
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const r = el.getBoundingClientRect();
      if (own && cs.display !== 'none' && (r.width > 0 || el instanceof SVGElement)) {
        bump(painted, w);
        (sample[w] ||= new Set()).add(lab(el));
      }
    }
    for (const pe of ['::before', '::after']) {
      const p = getComputedStyle(el, pe);
      if (p.content !== 'none' && p.content !== 'normal' && isMitr(p)) { bump(all, p.fontWeight); bump(painted, p.fontWeight); }
    }
  }
  return { innerWidth, all, painted, sample: Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, [...v].slice(0, 6)])) };
`;

export default async function (session) {
  await session.setWidth(W, W < 640 ? 640 : 900, W < 640);
  const urls = pages(DIST);
  const out = [];
  for (const u of urls) {
    await session.nav(`${BASE}${u}`);
    const r = await session.evaluate(CENSUS);
    out.push({ path: u, ...(r.value ?? { error: r.error }) });
  }
  const union = {};
  for (const p of out) for (const [w, n] of Object.entries(p.painted ?? {})) union[w] = (union[w] || 0) + n;
  const unionAll = {};
  for (const p of out) for (const [w, n] of Object.entries(p.all ?? {})) unionAll[w] = (unionAll[w] || 0) + n;
  await session.close();
  return { width: W, pageCount: urls.length, unionPainted: union, unionAll, pages: out, consoleErrors: session.consoleErrors };
}
