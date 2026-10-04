// gh#247: geometry of the shared page chrome, measured on the built pages in a real browser.
//   BASE=http://localhost:4331 CDP_PORT=9331 W=1440 node scripts/driver.mjs <this file> > out.json
// Counts, per page: header box and its .chrome-inner row, footer box, the brand and pill boxes
// (getBoundingClientRect), computed fonts, whether the pills share one row (equal top), and
// scrollWidth vs clientWidth of the root element (horizontal scroll). Read-only.
const BASE = process.env.BASE || 'http://localhost:4321';
const W = Number(process.env.W || 320);
const PAGES = (process.env.PAGES || '/,/c/party/,/c/fortune/').split(',');

const PROBE = `
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
  const header = document.querySelector('header[data-page-chrome]');
  const footer = document.querySelector('footer[data-page-chrome]');
  const pills = [...document.querySelectorAll('.chrome-pill')];
  const cs = (el, props) => { const c = getComputedStyle(el); return Object.fromEntries(props.map((p) => [p, c[p]])); };
  const tops = pills.map((p) => Math.round(p.getBoundingClientRect().top));
  const de = document.documentElement;
  return {
    path: location.pathname, innerWidth,
    scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, hScroll: de.scrollWidth > de.clientWidth,
    header: box(header), headerInner: box(header?.querySelector('.chrome-inner')),
    footer: box(footer), footerInner: box(footer?.querySelector('.chrome-inner')),
    brand: box(document.querySelector('.chrome-brand')),
    brandStyle: cs(document.querySelector('.chrome-brand'), ['fontFamily', 'fontSize', 'fontWeight', 'color']),
    pills: pills.map((p) => ({ text: p.textContent.trim(), ...box(p), ...cs(p, ['backgroundColor', 'color', 'fontSize', 'fontWeight', 'paddingTop', 'paddingLeft', 'borderTopLeftRadius']) })),
    pillsOneRow: new Set(tops).size === 1, pillsGap: pills.length > 1 ? Math.round((pills[1].getBoundingClientRect().left - pills[0].getBoundingClientRect().right) * 10) / 10 : null,
    pillsBox: box(document.querySelector('.chrome-pills')),
    headerBg: cs(header, ['backgroundColor']).backgroundColor,
    footerStyle: cs(document.querySelector('.chrome-footer-brand'), ['fontFamily', 'fontSize', 'fontWeight', 'color']),
    footerLinks: footer ? footer.querySelectorAll('a').length : null,
    headerLinks: header ? header.querySelectorAll('a').length : null,
    footerAfterMain: footer ? Math.round(footer.getBoundingClientRect().top - (document.querySelector('main')?.getBoundingClientRect().bottom ?? 0)) : null,
  };
`;

export default async function (session) {
  await session.setWidth(W, W < 640 ? 640 : 900, W < 640);
  const pages = [];
  for (const p of PAGES) {
    await session.nav(`${BASE}${p}`);
    const r = await session.evaluate(PROBE);
    pages.push(r.value ?? { path: p, error: r.error });
  }
  await session.close();
  return { width: W, pages, consoleErrors: session.consoleErrors };
}
