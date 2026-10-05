const ORIGIN = 'http://127.0.0.1:4393';
const OUT = '/Users/waris.c/claude/free-game/docs/verification/evidence/gh255';
const PAGES = [
  ['/', 'chrome'], ['/tools/', 'chrome'], ['/tool/wheel/', 'chrome'], ['/tool/draw/', 'chrome'],
  ['/tool/team/', 'chrome'], ['/tool/number/', 'chrome'], ['/404.html', 'chrome'],
  ['/game/siamsi/', 'solo'], ['/game/daily-fortune/', 'solo'], ['/game/love-match/', 'solo'],
];
const PROBE = `
  const q = (s) => document.querySelectorAll(s);
  const top = document.querySelector('[data-page-chrome="topbar"]');
  const foot = document.querySelector('[data-page-chrome="footer"]');
  const head = document.querySelector('.tool-head, header.game-topbar, main > header, main h1');
  const de = document.documentElement;
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top + scrollY), w: Math.round(b.width), h: Math.round(b.height) }; };
  return {
    innerWidth, scrollWidth: de.scrollWidth, bodyScrollWidth: document.body.scrollWidth,
    topbar: q('[data-page-chrome="topbar"]').length, footerMarker: q('[data-page-chrome="footer"]').length,
    footerTags: q('footer').length,
    footerLinks: foot ? foot.querySelectorAll('a').length : null,
    topbarBeforeHead: top && head ? !!(top.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING) : null,
    footerIsLastLandmark: foot ? ![...q('main, nav, header, section')].some((el) => foot.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) : null,
    stableExit: q('[data-stable-exit]').length,
    stableExitInGameTopbar: !!document.querySelector('header.game-topbar > a[data-stable-exit]'),
    gameTopbarFirstInMain: document.querySelector('main')?.firstElementChild?.matches('header.game-topbar') ?? false,
    toolBack: q('.tool-back').length,
    topbarRect: r(top), footerRect: r(foot), headRect: r(head),
  };
`;
export default async function (session) {
  const rows = [];
  for (const [w, h] of [[320, 640], [1440, 900]]) {
    await session.setWidth(w, h);
    for (const [p, cls] of PAGES) {
      await session.nav(ORIGIN + p);
      await session.wipe();
      await new Promise((res) => setTimeout(res, 300));
      const { value, error } = await session.evaluate(PROBE);
      if (error) { rows.push({ p, w, error }); continue; }
      const v = value;
      const okChrome = cls === 'chrome'
        ? v.topbar === 1 && v.footerMarker === 1 && v.footerTags === 1
        : v.topbar === 0 && v.footerMarker === 1 && v.footerTags === 1 && v.stableExitInGameTopbar && v.gameTopbarFirstInMain;
      const noSideways = v.scrollWidth <= v.innerWidth;
      const slug = p === '/' ? 'home' : p.replace(/^\/|\/$|\.html$/g, '').replace(/\//g, '-');
      const shot = `${OUT}/${slug}-${w}.png`;
      await session.screenshot(shot);
      rows.push({ p, w, cls, verdict: okChrome && noSideways && (v.innerWidth === w) ? 'PASS' : 'FAIL', ...v, shot: shot.replace(OUT + '/', '') });
    }
  }
  return { n: rows.length, pass: rows.filter((r) => r.verdict === 'PASS').length, consoleErrors: session.consoleErrors, rows };
}
