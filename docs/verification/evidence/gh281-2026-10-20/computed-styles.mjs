// gh#281 REFUTE spot-fix: computed style of the pass screen's elements at one viewport, to compare builds.
// Run: CDP_PORT=<port> BASE=<url> VP=390x844 node scripts/driver.mjs docs/verification/evidence/gh281-2026-10-20/computed-styles.mjs > out.json
// Same walk as measure-ready.mjs (default roster, forced draw, start, rule-ready), then one read per selector.
const BASE = process.env.BASE || 'http://localhost:4621';
const [W, H] = (process.env.VP || '390x844').split('x').map(Number);
const DRAW = Number(process.env.DRAW ?? 7);
const v = (DRAW + 0.5) / 9;
const KEY = 'watduang:__fit-draw';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OVERRIDE = `(() => { try { const raw = localStorage.getItem(${JSON.stringify(KEY)});
  if (raw !== null) { const x = Number(raw); if (x >= 0 && x < 1) Math.random = () => x; } } catch (e) {} })();`;
const SELECTORS = ['#app header', '.pass-container', '.pass-player-card', '.player-name-huge', '.player-name-huge > span',
  '.pass-condition-box', '.pass-target-badge', '.pass-condition-prompt', '#playerReadyBtn'];
const PROPS = ['fontSize', 'lineHeight', 'paddingTop', 'paddingBottom', 'marginTop', 'marginBottom', 'width', 'height', 'rowGap'];
const READ = `const out = {};
  for (const sel of ${JSON.stringify(SELECTORS)}) {
    const el = document.querySelector(sel);
    if (!el) { out[sel] = null; continue; }
    const cs = getComputedStyle(el);
    out[sel] = Object.fromEntries(${JSON.stringify(PROPS)}.map((p) => [p, cs[p]]));
  }
  return { innerWidth, out };`;

export default async function (session) {
  await session.onNewDocument(OVERRIDE);
  const url = `${BASE}/game/freeze-tap/play/`;
  await session.nav(url);
  await session.setWidth(W, H);
  await session.wipe();
  await session.evaluate(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(String(v))}); return true;`);
  await session.nav(url);
  await session.setWidth(W, H);
  await sleep(2500);
  for (const sel of ['[data-ps=start]', '#ruleReadyBtn']) {
    await sleep(900);
    await session.evaluate(`document.querySelector(${JSON.stringify(sel)})?.click(); return true;`);
    await sleep(900);
  }
  const r = (await session.evaluate(READ)).value;
  return { vp: `${W}x${H}`, draw: DRAW, ...r };
}
