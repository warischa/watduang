// gh#289 diagnostic. gh#289 lifecycle checks the probe does not cover: press-mode stop landing,
// reset and mode switch mid-landing (must never reveal), reduced motion (reveals at once).
const NAMES = ['A', 'B', 'C', 'D', 'E'];
const SEED = `
  const input = document.getElementById('name-input');
  input.value = ${JSON.stringify(NAMES)}.join('\\n');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('name-start').click();
  const g = document.querySelector('#wheel-group');
  const res = document.getElementById('wheel-result');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__t = { reveals: [], ends: [] };
  new MutationObserver(() => { const t = (res.textContent || '').trim(); if (t) window.__t.reveals.push({ at: performance.now(), text: t,
    running: g.getAnimations().filter((a) => a.playState === 'running').length }); })
    .observe(res, { childList: true, characterData: true, subtree: true });
  g.addEventListener('transitionend', (e) => { if (e.target === g && e.propertyName === 'transform') window.__t.ends.push(performance.now()); });
`;
const SCEN = {
  press: `${SEED}
    document.querySelector('input[name="wheel-mode"][value="press"]').click();
    document.getElementById('wheel-spin').click();
    await sleep(1000);
    const stopAt = performance.now();
    document.getElementById('wheel-stop').click();
    for (let k = 0; k < 120 && window.__t.reveals.length === 0; k++) await sleep(50);
    await sleep(300);
    const r = window.__t.reveals[0];
    return { revealAfterStop: r && Math.round(r.at - stopAt), runningAtReveal: r && r.running,
      landAfterStop: window.__t.ends[0] && Math.round(window.__t.ends[0] - stopAt) };`,
  reset: `${SEED}
    document.getElementById('wheel-spin').click();
    await sleep(800);
    document.getElementById('wheel-reset').click();
    await sleep(7000);
    const afterReset = window.__t.reveals.length;
    document.getElementById('name-start').click();
    const c = performance.now();
    document.getElementById('wheel-spin').click();
    for (let k = 0; k < 120 && window.__t.reveals.length === afterReset; k++) await sleep(50);
    const r = window.__t.reveals[afterReset];
    return { revealsWithin7sOfReset: afterReset, resultAfterReset: (res.textContent || '').trim() || null,
      nextSpinRevealMs: r && Math.round(r.at - c), nextSpinRunning: r && r.running };`,
  mode: `${SEED}
    document.getElementById('wheel-spin').click();
    await sleep(800);
    document.querySelector('input[name="wheel-mode"][value="press"]').click();
    await sleep(7000);
    return { revealsAfterModeSwitch: window.__t.reveals.length, spinDisabled: document.getElementById('wheel-spin').disabled };`,
  reduced: `${SEED}
    const c = performance.now();
    document.getElementById('wheel-spin').click();
    await sleep(500);
    const r = window.__t.reveals[0];
    return { matches: matchMedia('(prefers-reduced-motion: reduce)').matches, revealMs: r && Math.round(r.at - c), running: r && r.running };`,
};
export default async function (session) {
  const base = process.env.PROBE_BASE;
  const rate = Number(process.env.RATE || 1);
  const out = {};
  for (const name of Object.keys(SCEN)) {
    await session.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: name === 'reduced' ? 'reduce' : 'no-preference' }] });
    await session.nav(`${base}/tool/wheel/`);
    await session.wipe();
    await session.nav(`${base}/tool/wheel/`);
    await session.setWidth(390, 900);
    await session.cdp('Animation.enable');
    await session.cdp('Animation.setPlaybackRate', { playbackRate: rate });
    const r = await session.evaluate(SCEN[name]);
    out[name] = r.error ? { error: r.error } : r.value;
  }
  return { rate, ...out };
}
