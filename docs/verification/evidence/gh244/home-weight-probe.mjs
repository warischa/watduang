// gh#244 box 5 — the home page's weight, measured the same way before and after the canvas D build.
//
// WHAT IT COUNTS: bytes the page REQUESTS in a real browser — the document plus every subresource
// the Resource Timing API reports — never bytes sitting in dist/. Two moments per width:
//   firstLoad  — after the load event plus a settle, no scroll (lazy images below the fold excluded)
//   fullScroll — after scrolling to the bottom one viewport at a time (every lazy image requested)
// Sizes are encodedBodySize (body bytes on the wire after content coding, headers excluded) and
// decodedBodySize. A cache hit would still report encodedBodySize, but each run uses a fresh Chrome
// profile, so none is expected; `cached` counts entries with transferSize 0 so a cache hit is visible.
//
// Run, one width per fresh Chrome (fresh --user-data-dir, so nothing is served from cache):
//   npm run build && npx serve dist/ -l 4321
//   Chrome: --headless --disable-gpu --no-sandbox --remote-debugging-port=9222 --user-data-dir=<fresh>
//   W=1440 node scripts/driver.mjs docs/verification/evidence/gh244/home-weight-probe.mjs
//   W=320  node scripts/driver.mjs docs/verification/evidence/gh244/home-weight-probe.mjs
const BASE = process.env.BASE || 'http://localhost:4321';
const W = Number(process.env.W || 1440);
const H = W < 640 ? 640 : 900;

const READ = `
  const nav = performance.getEntriesByType('navigation')[0];
  const res = performance.getEntriesByType('resource');
  const rows = [nav, ...res].map((e) => ({
    url: e.name.replace(location.origin, ''),
    type: e.initiatorType || 'document',
    enc: e.encodedBodySize,
    dec: e.decodedBodySize,
    xfer: e.transferSize,
  }));
  const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  return {
    innerWidth,
    requests: rows.length,
    encodedBytes: sum('enc'),
    decodedBytes: sum('dec'),
    cached: rows.filter((r) => r.xfer === 0).length,
    rows,
  };
`;

export default async function (session) {
  await session.setWidth(W, H, W < 640);
  await session.nav(`${BASE}/`);
  await new Promise((r) => setTimeout(r, 1500));
  const firstLoad = (await session.evaluate(READ)).value;
  await session.evaluate(`
    const step = innerHeight;
    for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 600));
    }
    return true;
  `);
  await new Promise((r) => setTimeout(r, 1500));
  const fullScroll = (await session.evaluate(READ)).value;
  await session.close();
  return { width: W, height: H, firstLoad, fullScroll };
}
