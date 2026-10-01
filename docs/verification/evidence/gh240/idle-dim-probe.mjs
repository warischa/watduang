// gh#240 browser proof, a scripts/driver.mjs script. One page session at a real 320px viewport:
// start a round through the setup screen's start control, read the idle first-turn dice, tap the
// roll control, sample die 1 on every animation frame through the tumble and the landing, then read
// the landed dice. Screenshots of the idle and the landed screen are written next to this file.
//
//   CDP_PORT=<port> SITE=http://localhost:<port> LANE=<label> node scripts/driver.mjs <this file>
//
// Controls are pressed with session.tap (a real touch through Chrome's input pipeline), each one
// more than ARM_DELAY_MS after the reveal that armed it, and every step asserts the screen really
// moved before anything is measured -- a probe that reads a screen that never changed measures
// nothing.
const SITE = process.env.SITE ?? 'http://localhost:4377';
const LANE = process.env.LANE ?? 'default';
const OUT = process.env.SHOT_DIR ?? new URL('.', import.meta.url).pathname;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Per-die reading, evaluated in the page. `face` samples the die background inside its 9px padding,
// where no pip can sit, so the pixel read off the screenshot is the face colour and nothing else.
const READ_DICE = `
  const dice = ['dl-die-1', 'dl-die-2', 'dl-die-3'].map((id) => document.getElementById(id));
  return dice.map((die) => {
    const cs = getComputedStyle(die);
    const r = die.getBoundingClientRect();
    return {
      id: die.id,
      classes: die.className,
      filter: cs.filter,
      opacity: cs.opacity,
      backgroundColor: cs.backgroundColor,
      pipsOn: die.querySelectorAll('.dl-pip.is-on').length,
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      facePoint: { x: Math.round(r.left + 4), y: Math.round(r.top + r.height / 2) },
    };
  });`;

const SCREEN = `return {
  playHidden: document.getElementById('dl-play').hidden,
  score: document.getElementById('dl-score').textContent,
  live: document.getElementById('dl-live').textContent,
  turn: document.getElementById('dl-turn-name').textContent,
  currentPill: document.querySelector('#dl-pills .is-current')?.textContent ?? null,
  rollHidden: document.getElementById('dl-roll').hidden,
};`;

export default async function run(session) {
  const value = async (body) => {
    const r = await session.evaluate(body);
    if (r.error) throw new Error(`evaluate failed: ${r.error}`);
    return r.value;
  };
  const centreOf = async (sel) =>
    value(`const el = document.querySelector(${JSON.stringify(sel)});
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, hidden: el.hidden, disabled: el.disabled };`);

  const url = `${SITE}/game/dice-loser/play/`;
  await session.setWidth(320, 640);
  await session.nav(url);
  // Wiped ON the origin, then reloaded, then read back: a fresh device, verified rather than assumed.
  await session.wipe();
  await session.nav(url);
  const env = await value(`return {
    innerWidth, innerHeight, clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    storageKeys: localStorage.length, setupHidden: document.getElementById('dl-setup').hidden,
  };`);
  if (env.innerWidth !== 320) return { void: `innerWidth is ${env.innerWidth}, not 320`, env };

  await wait(900);
  const begin = await centreOf('#dl-begin');
  await wait(150);
  await session.tap(begin.x, begin.y);
  await wait(900);
  const idleScreen = await value(SCREEN);
  if (idleScreen.playHidden) return { void: 'the start control did not reach the turn screen', env, begin };
  const idle = await value(READ_DICE);
  await value(`document.getElementById('dl-die-1').scrollIntoView({ block: 'center' }); return true;`);
  const idleAfterScroll = await value(READ_DICE);
  const idleShot = `${OUT}/${LANE}-idle-first-turn.png`;
  await session.screenshot(idleShot);

  // Frame sampler on die 1, started before the tap so the frames before, during and after the tumble
  // are all in one trace. Summarised in the page by phase, so the output is a table, not 90 rows.
  await value(`
    const die = document.getElementById('dl-die-1');
    const t0 = performance.now();
    window.__gh240 = [];
    const tick = () => {
      const cs = getComputedStyle(die);
      window.__gh240.push({ t: performance.now() - t0, idle: die.classList.contains('is-idle'),
        rolling: die.classList.contains('is-rolling'), filter: cs.filter, opacity: Number(cs.opacity),
        transform: cs.transform });
      if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;`);
  await wait(150);
  const roll = await centreOf('#dl-roll');
  await session.tap(roll.x, roll.y);
  await wait(2200);
  const trace = await value(`
    const s = window.__gh240;
    const phase = (f) => (f.rolling ? 'rolling' : f.idle ? 'idle-before-roll' : 'landed');
    const out = {};
    for (const f of s) {
      const p = (out[phase(f)] ??= { frames: 0, filters: [], opacityMin: 1, opacityMax: 0, rollingWithoutIdle: 0, transformsSeen: 0 });
      p.frames += 1;
      if (!p.filters.includes(f.filter)) p.filters.push(f.filter);
      p.opacityMin = Math.min(p.opacityMin, f.opacity);
      p.opacityMax = Math.max(p.opacityMax, f.opacity);
      if (f.rolling && !f.idle) p.rollingWithoutIdle += 1;
      if (f.transform !== 'none') p.transformsSeen += 1;
    }
    return { totalFrames: s.length, phases: out };`);
  const landedScreen = await value(SCREEN);
  const landed = await value(READ_DICE);
  const landedShot = `${OUT}/${LANE}-landed.png`;
  await session.screenshot(landedShot);

  return { lane: LANE, env, begin, idleScreen, idle, idleAfterScroll, roll, trace, landedScreen, landed,
    shots: [idleShot, landedShot], consoleErrors: session.consoleErrors };
}
