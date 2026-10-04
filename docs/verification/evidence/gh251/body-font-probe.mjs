// gh#251: labeled readable-font probe. The UI audit probe beside the 2026-10-04 audit stores only the
// bare size of each sub-16 element; this one records selector path, size, text snippet and ROLE for
// every visible element that carries its own text (plus text inputs/textareas), so a sub-16 element
// can be judged against the owner's role list instead of being counted blind.
//
//   npm run build && npx serve dist/ -l 4381
//   Chrome: --headless --disable-gpu --no-sandbox --remote-debugging-port=9381 --user-data-dir=<fresh>
//   CDP_PORT=9381 W=320  OUT=<file.json> [SHOTS=<dir>] node scripts/driver.mjs <this file>
//   CDP_PORT=9381 W=1440 OUT=<file.json>               node scripts/driver.mjs <this file>
//
// Role set (owner ruling on gh#251): BODY roles must be >= 16px on phones; EXEMPT roles may stay
// smaller. The selector -> role map below is this probe's own, written down in the README beside it.
// First match wins. A sub-16 element matching no entry is UNCLASSIFIED and is reported, never passed.
// Elements at >= 16px need no role and are recorded with whatever the map gives them (or none).
//
// What a cold page load cannot see: text that renders only mid-round (team result cards, draw
// results, the wheel result line). The helper notes that start empty are measured anyway through
// FORCED below, which reads the computed size of the element whether or not it holds text yet.
import { writeFile } from 'node:fs/promises';

const BASE = process.env.BASE || 'http://localhost:4381';
const W = Number(process.env.W || 320);
const OUT = process.env.OUT;
const SHOTS = process.env.SHOTS;
const PAGES = (process.env.PAGES || '/,/c/party/,/c/fortune/,/tools/,/tool/wheel/,/tool/number/,/tool/draw/,/tool/team/').split(',');

export const ROLE_MAP = [
  // body roles
  ['.tool-tagline', 'body:tagline'],
  ['main > h1 + p', 'body:tagline'],
  ['.featured .desc', 'body:tile-description'],
  ['.tile .desc', 'body:tile-description'],
  ['.game-card > p', 'body:tile-description'],
  ['.tool-card > p', 'body:tile-description'],
  ['.sec-copy p', 'body:hub-body'],
  ['.faq-item p', 'body:faq-answer'],
  ['.name-hint', 'body:tool-helper'],
  ['.draw-note', 'body:tool-helper'],
  ['.team-note', 'body:tool-helper'],
  ['.wheel-note', 'body:tool-helper'],
  ['#name-input', 'body:name-entry-textarea'],
  // exempt roles
  ['.chrome-pill', 'exempt:pill'],
  ['.pills li', 'exempt:pill'],
  ['.badge', 'exempt:badge'],
  ['.tool-badge', 'exempt:badge'],
  ['.breadcrumb', 'exempt:breadcrumb'],
  ['.breadcrumb a', 'exempt:breadcrumb'],
  ['.tool-back', 'exempt:breadcrumb'],
  ['.ad-slot', 'exempt:label'],
  ['.ad-label', 'exempt:label'],
  ['.ad-sub', 'exempt:label'],
  ['.ad-slot-mobile', 'exempt:label'],
  ['.tool-eyebrow', 'exempt:label'],
  ['.wheel-mode-option', 'exempt:label'],
  ['.draw-count', 'exempt:label'],
  ['.team-count', 'exempt:label'],
  ['.kicker', 'exempt:label'],
  ['.card-cta', 'exempt:label'],
  ['.draw-box h3', 'exempt:label'],
  ['.number-actions button', 'exempt:label'],
];

const FORCED = ['.wheel-note', '.draw-note', '.team-note', '#name-input', '.name-hint'];

const BODY = `
  await document.fonts.ready;
  const MAP = ${JSON.stringify(ROLE_MAP)};
  const FORCED = ${JSON.stringify(FORCED)};
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0; };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
  const isCtl = (el) => /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(checkbox|radio|hidden)$/.test(el.type);
  const seg = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.split(/\\s+/).filter((c) => c && !c.startsWith('astro-')).join('.') : '');
  const pathOf = (el) => { const p = []; for (let e = el; e && e !== document.body && p.length < 4; e = e.parentElement) p.unshift(seg(e)); return p.join(' > '); };
  const roleOf = (el) => { for (const [s, r] of MAP) if (el.matches(s)) return r; return null; };
  const seen = new Set();
  const rows = [];
  const add = (el, forced) => {
    if (seen.has(el)) return; seen.add(el);
    const fs = parseFloat(getComputedStyle(el).fontSize);
    rows.push({ sel: pathOf(el), fs, role: roleOf(el), forced, text: (el.textContent || el.placeholder || '').trim().replace(/\\s+/g, ' ').slice(0, 30) });
  };
  for (const el of document.querySelectorAll('body *')) {
    if ((ownText(el) || isCtl(el)) && visible(el)) add(el, false);
  }
  for (const s of FORCED) for (const el of document.querySelectorAll(s)) if (getComputedStyle(el).display !== 'none') add(el, true);
  const de = document.documentElement;
  return { path: location.pathname, innerWidth, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, rows };
`;

export default async function (session) {
  await session.setWidth(W, 900, W < 640);
  const pages = [];
  for (const p of PAGES) {
    await session.nav(`${BASE}${p}`);
    const r = await session.evaluate(BODY);
    const v = r.value ?? { path: p, error: r.error, rows: [] };
    const under = v.rows.filter((x) => x.fs < 16);
    v.summary = {
      n: v.rows.length,
      under16: under.length,
      bodyUnder16: under.filter((x) => x.role?.startsWith('body:')).map((x) => `${x.fs} ${x.role} ${x.sel} "${x.text}"`),
      unclassifiedUnder16: under.filter((x) => !x.role).map((x) => `${x.fs} ${x.sel} "${x.text}"`),
      exemptUnder16: under.filter((x) => x.role?.startsWith('exempt:')).reduce((a, x) => ((a[x.role] = (a[x.role] || 0) + 1), a), {}),
      hScroll: v.scrollWidth !== v.clientWidth,
    };
    if (SHOTS) {
      // Scroll the page through once so every lazy image is requested, wait for each to settle,
      // then return to the top: a full-page capture otherwise shows unloaded art as empty tiles.
      await session.evaluate(`
        for (let y = 0; y <= document.documentElement.scrollHeight; y += innerHeight) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); }
        await Promise.all([...document.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 3000); })));
        scrollTo(0, 0); await new Promise((r) => setTimeout(r, 200)); return true;
      `);
      const slug = p.replace(/^\/|\/$/g, '').replace(/\//g, '-') || 'home';
      await session.screenshot(`${SHOTS}/${slug}-${W}.png`);
    }
    pages.push(v);
  }
  await session.close();
  const out = { width: W, base: BASE, pages, consoleErrors: session.consoleErrors };
  if (OUT) await writeFile(OUT, JSON.stringify(out, null, 1));
  return pages.map((p) => ({ path: p.path, innerWidth: p.innerWidth, ...p.summary, bodyUnder16: p.summary?.bodyUnder16.length, unclassifiedUnder16: p.summary?.unclassifiedUnder16 }));
}
