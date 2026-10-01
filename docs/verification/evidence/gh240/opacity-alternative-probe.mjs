// gh#240 counterfactual, a scripts/driver.mjs script: what an OPACITY dim would have done. play.css
// dims with `filter` and its comment says an opacity dim would be overridden by the reduced-motion
// tumble; this measures that instead of arguing it from the cascade. It injects ONE rule into the
// live page -- `.dl-die.is-idle { filter: none; opacity: 0.4 }`, the rejected alternative -- starts a
// round, taps roll, and samples die 1's opacity on every frame of the tumble.
//
//   CDP_PORT=<port> SITE=http://localhost:<port> node scripts/driver.mjs <this file>
//
// Expected reading if the comment is right: idle frames at 0.4, and rolling frames (still is-idle,
// still showing the decorative face) climbing above 0.4 under --force-prefers-reduced-motion.
const SITE = process.env.SITE ?? 'http://localhost:4377';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);

  const url = `${SITE}/game/dice-loser/play/`;
  await session.setWidth(320, 640);
  await session.nav(url);
  await session.wipe();
  await session.nav(url);
  const env = await value(`return { innerWidth, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };`);
  await value(`const s = document.createElement('style');
    s.textContent = '.dl-die.is-idle { filter: none; opacity: 0.4; }';
    document.head.appendChild(s); return true;`);
  await wait(900);
  const begin = await centreOf('#dl-begin');
  await session.tap(begin.x, begin.y);
  await wait(900);
  await value(`
    const die = document.getElementById('dl-die-1');
    const t0 = performance.now();
    window.__alt = [];
    const tick = () => {
      window.__alt.push({ idle: die.classList.contains('is-idle'), rolling: die.classList.contains('is-rolling'),
        opacity: Number(getComputedStyle(die).opacity) });
      if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;`);
  await wait(150);
  const roll = await centreOf('#dl-roll');
  await session.tap(roll.x, roll.y);
  await wait(1700);
  const trace = await value(`
    const out = {};
    for (const f of window.__alt) {
      const k = f.rolling ? 'rolling' : f.idle ? 'idle-before-roll' : 'landed';
      const p = (out[k] ??= { frames: 0, idleFrames: 0, opacityMin: 1, opacityMax: 0 });
      p.frames += 1;
      if (f.idle) p.idleFrames += 1;
      p.opacityMin = Math.min(p.opacityMin, f.opacity);
      p.opacityMax = Math.max(p.opacityMax, f.opacity);
    }
    return out;`);
  return { env, trace, consoleErrors: session.consoleErrors };
}
