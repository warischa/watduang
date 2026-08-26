// Proves reveal() in src/pages/tool/wheel.astro no longer re-slices the disc after announcing a
// winner. The confirmed defect: reveal() called drawWheel(remaining()) right after setting
// resultEl.textContent, redrawing the disc against a SHORTER list than the rotation had just been
// computed for — the pointer ended up over a DIFFERENT name's wedge than the result line said.
//
// This probe hit-tests the REAL PAINTED geometry after the spin settles. It never calls
// segmentAtPointer()/nameAtPointer() itself — recomputing what the fix computes proves nothing
// about what a player actually sees on screen.
//
// Shape follows scripts/gamenav-start-grid-probe.mjs: a default-exported async function(session)
// for scripts/driver.mjs. Also self-spawns that same driver when run directly, so one file covers
// both `node scripts/wheel-pointer-name-probe.mjs` and `node scripts/driver.mjs <this file>`
// without a second driver implementation.
//
// Setup (docs/agents/browser-verification.md):
//   npm run build && npx serve dist/ -l 4321 &
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     --headless --disable-gpu --no-sandbox --remote-debugging-port=9222 \
//     --user-data-dir=/tmp/wheel-ptr-prof &
//
// Direct run: node scripts/wheel-pointer-name-probe.mjs
// Via driver: node scripts/driver.mjs scripts/wheel-pointer-name-probe.mjs

const WIDTHS = [320, 390];
// Single-character names never hit labelText()'s truncation path, so the painted wedge label is
// always byte-identical to the untouched result text — a truncated label would be a false mismatch
// that has nothing to do with the defect this probe targets.
const NAMES = ['A', 'B', 'C', 'D', 'E'];

// Runs inside the page. Enters NAMES through the real name panel — now one textarea, one name per
// line — and starts the round through the real CTA click (never dispatches watduang:start directly —
// the trigger is what wires up `players`/render(), per docs/agents/browser-verification.md's "seed
// through the trigger" trap). Setting .value fires no 'input' event, so the persistence listener is
// nudged by hand; the CTA re-parses the box anyway, so the START path is still the real one. It then
// ticks the eliminate checkbox with a real click (fires the same 'change' listener a tap would), and
// spins 3 times so an elimination happens between spins, hit-testing the disc after each settle.
const PAGE_BODY = `
  const storageKey = 'watduang:tool:wheel-names';
  const seeded = localStorage.getItem(storageKey);
  if (seeded !== null) throw new Error('wipe did not land before seeding: ' + storageKey + '=' + seeded);

  const input = document.getElementById('name-input');
  if (input.tagName !== 'TEXTAREA') throw new Error('name panel is not the multi-line box: ' + input.tagName);
  input.value = ${JSON.stringify(NAMES)}.join('\\n');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('name-start').click();
  document.getElementById('wheel-eliminate').click();

  const spinBtn = document.getElementById('wheel-spin');
  const resultEl = document.getElementById('wheel-result');
  const svg = document.querySelector('#wheel-disc svg');
  const group = document.querySelector('#wheel-group');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const spins = [];
  for (let i = 0; i < 3; i++) {
    spinBtn.click();
    await sleep(2300); // SPIN_MS (2000) + reveal's own +60ms setTimeout + settle margin
    const resultText = (resultEl.textContent || '').trim();

    // Hit-test the REAL rendered geometry: the 12 o'clock axis, inset well inside the rim so a
    // sub-pixel boundary can't return the wrong element or null (this repo has been bitten before —
    // 196 false misses from sampling on a bounding-box edge). local y=60 sits inside the rim (edge
    // at y=36), clear of the hub (y>=154) and clear of the label ring (y~95, radius 105) so the hit
    // lands on the wedge <path> itself, never a text glyph.
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / 400; // viewBox is 400x400; CSS forces the svg square (aspect-ratio:1)
    const x = rect.left + rect.width / 2;
    const y = rect.top + 60 * scale;
    const hit = document.elementFromPoint(x, y);
    const paths = Array.from(group.querySelectorAll(':scope > path'));
    const texts = Array.from(group.querySelectorAll(':scope > text'));
    const idx = paths.indexOf(hit);
    spins.push({
      spin: i + 1,
      resultText,
      pointerLabel: idx >= 0 ? (texts[idx].textContent || '') : null,
      hitTag: hit ? hit.tagName : null,
      pathCount: paths.length,
    });
  }
  return { innerWidth, spins };
`;

export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:4321';
  const url = `${base}/tool/wheel/`;
  const runs = [];
  for (const width of WIDTHS) {
    await session.nav(url);
    await session.wipe();
    await session.nav(url); // reload ON-ORIGIN after the wipe (docs trap #4) so it actually lands
    await session.setWidth(width, 900);
    const res = await session.evaluate(PAGE_BODY);
    runs.push(res.error ? { width, error: res.error } : { width, ...res.value });
  }
  return { runs };
}

// Self-run: drives THIS file through scripts/driver.mjs (never a second driver), so the one-command
// verify (`node scripts/wheel-pointer-name-probe.mjs`) works without also typing driver.mjs by hand.
// When driver.mjs dynamically imports this module instead, process.argv[1] is driver.mjs's own path,
// not this file's — the check below stays false and this block never re-runs.
const { fileURLToPath } = await import('node:url');
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { spawnSync } = await import('node:child_process');
  const driverPath = fileURLToPath(new URL('./driver.mjs', import.meta.url));
  const selfPath = fileURLToPath(import.meta.url);
  const out = spawnSync('node', [driverPath, selfPath], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (out.status !== 0 || !out.stdout) {
    console.error(out.stderr || 'driver.mjs produced no output');
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(out.stdout.trim());
  } catch (err) {
    console.error(`could not parse driver.mjs output as JSON: ${err.message}\n${out.stdout}`);
    process.exit(1);
  }

  // Shape guard: driver.mjs:96 wraps the evaluate body as `(async () => { ${body} })()`, so a body
  // that never hits `return` (e.g. a page missing the wheel, or someone deleting the trailing
  // `return` line) resolves to `{value: undefined}` — parsed.runs is then undefined, `|| []` swallows
  // it silently, and the loops below execute zero times and print only the header, exiting 0. Assert
  // the exact shape this probe is contracted to produce (2 widths x 3 spins each) before judging it.
  if (!Array.isArray(parsed.runs) || parsed.runs.length !== 2) {
    console.error(
      `dead harness: expected 2 runs (one per width), got ${Array.isArray(parsed.runs) ? parsed.runs.length : typeof parsed.runs}`,
    );
    process.exit(1);
  }
  for (const run of parsed.runs) {
    if (run.error) continue; // a reported page-level error is a real failure, judged below — not a shape defect
    if (!Array.isArray(run.spins) || run.spins.length !== 3) {
      console.error(
        `dead harness: width ${run.width} expected 3 spins, got ${Array.isArray(run.spins) ? run.spins.length : typeof run.spins}`,
      );
      process.exit(1);
    }
    for (const s of run.spins) {
      if (typeof s.resultText !== 'string' || s.resultText === '') {
        console.error(`dead harness: width ${run.width} spin ${s.spin} has empty/missing resultText`);
        process.exit(1);
      }
      if (typeof s.pointerLabel !== 'string' || s.pointerLabel === '') {
        console.error(`dead harness: width ${run.width} spin ${s.spin} has empty/missing pointerLabel`);
        process.exit(1);
      }
    }
  }

  let ok = true;
  console.log('width  spin  result        pointer       match');
  for (const run of parsed.runs) {
    if (run.error) {
      ok = false;
      console.log(`${run.width}  ERROR: ${run.error}`);
      continue;
    }
    for (const s of run.spins) {
      const match = s.pointerLabel === s.resultText;
      if (!match) ok = false;
      console.log(
        `${run.width}    ${s.spin}     ${String(s.resultText).padEnd(12)}  ${String(s.pointerLabel).padEnd(12)}  ${match ? 'OK' : 'MISMATCH'}`,
      );
    }
  }
  process.exit(ok ? 0 : 1);
}
