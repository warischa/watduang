// gh#295 B1: the rendered /privacy/ page and its two inbound links, at 320, 390 and 1280.
//   - innerWidth equals the width asked for (else the run is void), no horizontal overflow;
//   - the page's main text, joiners stripped and whitespace normalised, equals the approved text file;
//   - the page is not noindex, has the board title, and its links go where the board says;
//   - the h1 line count, and computed values of the board's new literals (2px underline, 22px indent);
//   - the home band link and the feedback line link: href, colour, size, underline, and the tap area
//     read by elementFromPoint at 1px insets of a 44px band centred on the link (the hit area is a
//     pseudo-element, which a box read cannot see).
// Red = the default export throws after the run, listing every failed check, so driver.mjs exits non-zero;
// the recorded JSON shape is unchanged and only a fully green run returns it.
// Run: CDP_PORT=9352 BASE=http://localhost:9362 SHOTDIR=<dir> node scripts/driver.mjs <this file>
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE;
const here = dirname(fileURLToPath(import.meta.url));
const approvedPath = join(here, '..', 'gh295-boards-2026-11-07', 'privacy-approved-th.txt');
const norm = (s) => s.replace(/⁠/g, '').replace(/\s+/g, ' ').trim();
const APPROVED = norm(readFileSync(approvedPath, 'utf8'));

const PAGE = `
await document.fonts.ready;
await new Promise(r => setTimeout(r, 300));
const de = document.documentElement;
const main = document.querySelector('main');
const h1 = document.querySelector('h1');
const lh = parseFloat(getComputedStyle(h1).lineHeight);
const plink = document.querySelector('a.plink');
const ul = document.querySelector('.policy ul');
// Text of the policy block only: the h1 and lead, then the policy; the back link is page furniture.
const policyText = [document.querySelector('.pv-head-inner'), document.querySelector('.policy')].map(e => e.innerText).join(' ');
return {
  innerWidth, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
  over: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > de.clientWidth + 0.5).length,
  title: document.title,
  robots: document.querySelector('meta[name=robots]')?.content ?? null,
  canonical: document.querySelector('link[rel=canonical]')?.href ?? null,
  policyText,
  h1Lines: Math.round(h1.getBoundingClientRect().height / lh),
  h1Size: getComputedStyle(h1).fontSize,
  links: [...main.querySelectorAll('a')].map(a => a.textContent.replace(/\\u2060/g, '') + ' -> ' + a.getAttribute('href')),
  plinkUnderline: plink && [getComputedStyle(plink).textDecorationLine, getComputedStyle(plink).textDecorationThickness],
  ulIndent: ul && getComputedStyle(ul).paddingLeft,
  footerAnchors: document.querySelectorAll('footer a').length,
};`;

const LINK = (sel) => `
await document.fonts.ready;
await new Promise(r => setTimeout(r, 300));
const a = document.querySelector(${JSON.stringify(sel)});
if (!a) return { missing: ${JSON.stringify(sel)} };
a.scrollIntoView({ block: 'center' });
await new Promise(r => setTimeout(r, 900));
const r = a.getBoundingClientRect();
const cs = getComputedStyle(a);
const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
// Sample the 44px band centred on the link, 1px inside each edge, and just outside it.
const hits = (y) => { const el = document.elementFromPoint(cx, y); return !!el && (el === a || a.contains(el)); };
return {
  href: a.getAttribute('href'), text: a.textContent.replace(/\\u2060/g, ''),
  color: cs.color, fontSize: cs.fontSize, underline: [cs.textDecorationLine, cs.textDecorationThickness],
  boxHeight: Math.round(r.height * 100) / 100,
  hitTop: hits(cy - 21), hitBottom: hits(cy + 21), hitAboveBand: hits(cy - 23), hitBelowBand: hits(cy + 23),
  lines: a.getClientRects().length,
};`;

const EXPECT_LINKS = ['/feedback/', 'https://adssettings.google.com', 'https://optout.aboutads.info/', '/feedback/', '/'];

// Every expectation the rows record, as a list of failed-check messages (empty = green).
function failures(out) {
  const fails = [];
  for (const row of out) {
    if (row.consoleErrors) continue;
    const at = `${row.page}@${row.w}`;
    if (row.error || row.missing) { fails.push(`${at}: page read failed (${row.error ?? 'missing ' + row.missing})`); continue; }
    if (row.page === '/privacy/') {
      if (row.innerWidth !== row.w) fails.push(`${at}: innerWidth ${row.innerWidth}, run void`);
      if (!(row.scrollWidth <= row.clientWidth) || row.over !== 0) fails.push(`${at}: horizontal overflow (scrollWidth ${row.scrollWidth} > clientWidth ${row.clientWidth}, ${row.over} elements past the edge)`);
      if (row.textEqualsApproved !== true) fails.push(`${at}: policy text differs from the approved text (${row.textLen} vs ${row.approvedLen} chars)`);
      if (/noindex/i.test(row.robots ?? '')) fails.push(`${at}: page is noindex (${row.robots})`);
      if (typeof row.title !== 'string' || !row.title.includes('นโยบายความเป็นส่วนตัว')) fails.push(`${at}: title is not the board title (${row.title})`);
      if (typeof row.canonical !== 'string' || !row.canonical.endsWith('/privacy/')) fails.push(`${at}: canonical is ${row.canonical}`);
      const hrefs = (row.links ?? []).map((l) => l.split(' -> ').pop());
      if (JSON.stringify(hrefs) !== JSON.stringify(EXPECT_LINKS)) fails.push(`${at}: link targets ${JSON.stringify(hrefs)}, expected ${JSON.stringify(EXPECT_LINKS)}`);
      if (row.plinkUnderline?.[1] !== '2px') fails.push(`${at}: policy link underline ${JSON.stringify(row.plinkUnderline)}, expected 2px`);
      if (row.ulIndent !== '22px') fails.push(`${at}: list indent ${row.ulIndent}, expected 22px`);
    } else {
      if (row.href !== '/privacy/') fails.push(`${at}: link goes to ${row.href}, expected /privacy/`);
      if (row.underline?.[1] !== '2px') fails.push(`${at}: link underline ${JSON.stringify(row.underline)}, expected 2px`);
      if (row.hitTop !== true || row.hitBottom !== true) fails.push(`${at}: tap area misses the 44px band (top ${row.hitTop}, bottom ${row.hitBottom})`);
    }
  }
  return fails;
}

export default async function (session) {
  const out = [];
  for (const [w, h] of [[320, 568], [390, 844], [1280, 800]]) {
    await session.setWidth(w, h);
    await session.nav(BASE + '/privacy/');
    const r = await session.evaluate(PAGE);
    const v = r.value ?? r;
    out.push({
      page: '/privacy/', w, ...v, policyText: undefined,
      textEqualsApproved: v.policyText ? norm(v.policyText) === APPROVED : false,
      textLen: v.policyText ? norm(v.policyText).length : 0, approvedLen: APPROVED.length,
    });
    if (process.env.SHOTDIR) await session.screenshot(`${process.env.SHOTDIR}/privacy-${w}.png`);
    await session.nav(BASE + '/');
    const band = await session.evaluate(LINK('.band-feedback a.feedback-privacy'));
    out.push({ page: '/ band link', w, ...(band.value ?? band) });
    if (process.env.SHOTDIR) await session.screenshot(`${process.env.SHOTDIR}/home-band-link-${w}.png`);
    await session.nav(BASE + '/feedback/');
    const line = await session.evaluate(LINK('.fb-privacy a'));
    out.push({ page: '/feedback/ line link', w, ...(line.value ?? line) });
    if (process.env.SHOTDIR) await session.screenshot(`${process.env.SHOTDIR}/feedback-line-link-${w}.png`);
  }
  out.push({ consoleErrors: session.consoleErrors });
  const fails = failures(out);
  if (fails.length) throw new Error(`privacy page probe red (${fails.length}): ${fails.join(' | ')}`);
  return out;
}
