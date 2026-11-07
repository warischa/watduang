// gh#296: the desktop card in mode B and with a filled result, the states the layout probe does not
// reach. Mode B un-hides the stop control, so the controls stack outgrows the disc and the 1fr spacers
// fall to zero; the disc must still centre on the controls and nothing may scroll sideways. Then the
// names-in feedback (disc, note, spin) must sit in the viewport, and after one reduced-motion spin in
// mode A the result bar must be filled, 60px tall, as wide as the controls track.
// Run: CDP_PORT=9381 PROBE_BASE=http://localhost:4402 PROBE_OUT=<result.json> node scripts/driver.mjs <this file>
import { writeFileSync } from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const READ = `
  const b = (q) => document.querySelector(q).getBoundingClientRect();
  const st = b('.wheel-stage'), r = b('#wheel-result'), t = b('.wheel-toggle'), de = document.documentElement;
  const res = document.getElementById('wheel-result');
  return { innerWidth, innerHeight, sw: de.scrollWidth, cw: de.clientWidth,
    stopShown: !document.getElementById('wheel-stop').hidden,
    controlsH: t.bottom - r.top, discMid: (st.top + st.bottom) / 2, controlsMid: (r.top + t.bottom) / 2,
    disc: [b('#wheel-disc').top, b('#wheel-disc').bottom], note: b('#wheel-note').top, spinBottom: b('#wheel-spin').bottom,
    result: { text: res.textContent.trim(), w: r.width, h: r.height, border: getComputedStyle(res).borderTopStyle },
    controlsW: b('.wheel-toggle').width };
`;
export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:4402';
  const url = `${base}/tool/wheel/`;
  const rows = [], fails = [];
  await session.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const w of [1100, 1280, 1440]) {
    await session.setWidth(w, 900, false);
    await session.nav(url); await session.wipe(); await session.nav(url);
    await session.evaluate(`document.querySelector('input[name="wheel-mode"][value="press"]').click(); return true;`);
    const ta = `const ta = document.getElementById('name-input'); ta.value = 'ก\\nข\\nค'; ta.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('name-start').scrollIntoView({ block: 'end' }); document.getElementById('name-start').click(); return true;`;
    await session.evaluate(ta);
    await sleep(1500);
    const modeB = (await session.evaluate(READ)).value;
    await session.evaluate(`document.querySelector('input[name="wheel-mode"][value="auto"]').click(); return true;`);
    await sleep(1200);
    await session.evaluate(`document.getElementById('wheel-spin').click(); return true;`);
    await sleep(2500);
    const filled = (await session.evaluate(READ)).value;
    rows.push({ width: w, modeB, filled });
    const f = (m) => fails.push(`${w}: ${m}`);
    if (modeB.innerWidth !== w) f('innerWidth mismatch, run void');
    if (!modeB.stopShown) f('mode B did not show the stop control, run void');
    if (!(modeB.controlsH > 400)) f(`controls ${modeB.controlsH}px, expected taller than the disc in mode B`);
    if (Math.abs(modeB.discMid - modeB.controlsMid) > 1) f(`mode B midlines disc ${modeB.discMid} vs controls ${modeB.controlsMid}`);
    if (modeB.sw !== modeB.cw || filled.sw !== filled.cw) f('sideways overflow');
    if (modeB.disc[0] < -0.5 || modeB.disc[1] > modeB.innerHeight + 0.5 || modeB.note < 0 || modeB.spinBottom > modeB.innerHeight) f('names-in feedback outside the viewport in mode B');
    if (!filled.result.text) f('no result after a spin');
    if (filled.result.h !== 60 || filled.result.border === 'dashed' || Math.abs(filled.result.w - filled.controlsW) > 0.5) f(`result bar ${JSON.stringify(filled.result)} vs controls ${filled.controlsW}`);
  }
  await session.cdp('Emulation.setEmulatedMedia', { features: [] });
  const out = { probe: 'gh296-desktop-mode-b', base, pass: fails.length === 0, fails, rows };
  if (process.env.PROBE_OUT) writeFileSync(process.env.PROBE_OUT, JSON.stringify(out, null, 2) + '\n');
  if (fails.length) throw new Error(`mode B red (${fails.length}): ${fails.join(' | ')}`);
  return { pass: true, rows: rows.map((r) => `${r.width}: B controls ${r.modeB.controlsH} mid ${r.modeB.discMid}/${r.modeB.controlsMid} spinB ${r.modeB.spinBottom}; result "${r.filled.result.text}" ${r.filled.result.w}x${r.filled.result.h}`) };
}
