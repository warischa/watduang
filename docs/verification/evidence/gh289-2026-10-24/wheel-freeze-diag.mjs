// gh#289 diagnostic. H5' lever: no frames for FREEZE ms after the spin click (GPU process SIGSTOPped),
// while the renderer main thread and its timers keep running. Same seed and spins as the probe.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = ['A', 'B', 'C', 'D', 'E'];
const SETUP = `
  const input = document.getElementById('name-input');
  input.value = ${JSON.stringify(NAMES)}.join('\\n');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('name-start').click();
  document.getElementById('wheel-eliminate').click();
  const group = document.querySelector('#wheel-group');
  const resultEl = document.getElementById('wheel-result');
  window.__w = { revealAt: null, endAt: null, c: 0 };
  group.addEventListener('transitionend', () => { window.__w.endAt = performance.now(); });
  new MutationObserver(() => { if ((resultEl.textContent || '').trim() && window.__w.revealAt === null) window.__w.revealAt = performance.now(); })
    .observe(resultEl, { childList: true, characterData: true, subtree: true });
  window.__pointer = () => {
    const svg = document.querySelector('#wheel-disc svg');
    const rect = svg.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 60 * (rect.width / 400));
    const paths = Array.from(group.querySelectorAll(':scope > path'));
    const texts = Array.from(group.querySelectorAll(':scope > text'));
    const idx = paths.indexOf(hit);
    return idx >= 0 ? texts[idx].textContent : null;
  };
  return true;
`;
const READ = `
  const w = window.__w, group = document.querySelector('#wheel-group');
  const a = group.getAnimations()[0];
  return { at: Math.round(performance.now() - w.c), result: (document.getElementById('wheel-result').textContent || '').trim(),
    pointer: window.__pointer(), running: !!a, startRel: a && a.startTime != null ? Math.round(a.startTime - w.c) : null,
    revealRel: w.revealAt && Math.round(w.revealAt - w.c), endRel: w.endAt && Math.round(w.endAt - w.c) };
`;
export default async function (session) {
  const base = process.env.PROBE_BASE;
  const gpu = Number(process.env.GPU_PID || 0);
  const FREEZE = Number(process.env.FREEZE || 0);
  if (FREEZE && !gpu) throw new Error('FREEZE needs GPU_PID');
  await session.nav(`${base}/tool/wheel/`);
  await session.wipe();
  await session.nav(`${base}/tool/wheel/`);
  await session.setWidth(390, 900);
  const RATE = Number(process.env.RATE || 1);
  if (RATE !== 1) { await session.cdp('Animation.enable'); await session.cdp('Animation.setPlaybackRate', { playbackRate: RATE }); }
  const s = await session.evaluate(SETUP);
  if (s.error) return { error: s.error };
  const spins = [];
  for (let i = 0; i < 3; i++) {
    if (FREEZE) process.kill(gpu, 'SIGSTOP');
    const t0 = Date.now();
    await session.evaluate(`window.__w.revealAt = null; window.__w.endAt = null; window.__w.c = performance.now(); document.getElementById('wheel-spin').click(); return 1;`);
    if (FREEZE) { await sleep(FREEZE); process.kill(gpu, 'SIGCONT'); }
    await sleep(Math.max(0, 2300 - (Date.now() - t0)));
    const at2300 = (await session.evaluate(READ)).value;
    await sleep(2500);
    const settled = (await session.evaluate(READ)).value;
    spins.push({ spin: i + 1, at2300, settled });
  }
  return { freeze: FREEZE, spins };
}
