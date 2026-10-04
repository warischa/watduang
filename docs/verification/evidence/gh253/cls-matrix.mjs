// gh#253: CLS on the solo landings, page x width x network, one fresh Chrome per run (run.mjs).
//   node docs/verification/evidence/gh253/cls-matrix.mjs <dist-dir> <label>
// fast      = docs/verification/evidence/ui-audit-2026-10-04/ui-audit-probe.mjs (the ticket's instrument),
//             all three pages in one run, REPEATS runs per width
// throttled = docs/verification/evidence/gh252/swap-probe.mjs THROTTLE=1 FONTS=normal (Lighthouse slow-4G
//             on every request, the gh#252 README method), one page per run, TREPEATS runs per cell
// phone     = throttled-cls-probe.mjs (same slow-4G profile) at real phone viewports PHONES (W x H), where the
//             how-to section is inside the first screen; TREPEATS runs per cell
// Writes cls-<label>.json here: { fast | throttled | phone: {page: {width or WxH: [cls...]}}, shifts: raw entries }.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const [dist, label] = process.argv.slice(2);
if (!dist || !label) { console.error('usage: cls-matrix.mjs <dist-dir> <label>'); process.exit(2); }
const PAGES = (process.env.PAGES || '/game/siamsi/,/game/daily-fortune/,/game/love-match/').split(',');
const WIDTHS = (process.env.WIDTHS || '320,414,768,1440').split(',');
const REPEATS = Number(process.env.REPEATS || 3);
const TREPEATS = Number(process.env.TREPEATS || 2);
const MODES = (process.env.MODES || 'fast,throttled,phone').split(',');
const PHONES = (process.env.PHONES || '390x844,360x780').split(',');

const run = (env, args) => {
  const r = spawnSync('node', [join(HERE, 'run.mjs'), dist, ...args], { env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`run failed (${r.status}): ${r.stderr.slice(0, 400)}`);
  return JSON.parse(r.stdout);
};
const out = { label, dist, fast: {}, throttled: {}, phone: {}, shifts: {} };
const put = (t, p, w, v) => (((t[p] ||= {})[w] ||= []).push(v));
for (const w of WIDTHS) {
  if (MODES.includes('fast')) for (let n = 0; n < REPEATS; n++) {
    const j = run({ W: w, PAGES: PAGES.join(',') }, ['scripts/driver.mjs', 'docs/verification/evidence/ui-audit-2026-10-04/ui-audit-probe.mjs']);
    for (const pg of j.pages) put(out.fast, pg.path, w, pg.cls ?? `error: ${pg.error}`);
  }
  if (MODES.includes('throttled')) for (const p of PAGES) for (let n = 0; n < TREPEATS; n++) {
    const j = run({ W: w, PAGE: p, THROTTLE: '1', FONTS: 'normal' }, ['docs/verification/evidence/gh252/swap-probe.mjs']);
    put(out.throttled, p, w, j.cls);
    put(out.shifts, p, w, j.shifts);
  }
  console.error(`width ${w} done`);
}
if (MODES.includes('phone')) for (const vp of PHONES) for (const p of PAGES) for (let n = 0; n < TREPEATS; n++) {
  const [w, h] = vp.split('x');
  const j = run({ W: w, H: h, PAGE: p }, [join(HERE, 'throttled-cls-probe.mjs')]);
  put(out.phone, p, vp, j.cls);
  put(out.shifts, p, `phone-${vp}`, j.shifts);
}
writeFileSync(join(HERE, `cls-${label}.json`), JSON.stringify(out, null, 2));
for (const mode of ['fast', 'throttled', 'phone']) for (const [p, ws] of Object.entries(out[mode])) console.log(mode, p, JSON.stringify(ws));
