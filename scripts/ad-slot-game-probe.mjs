// Measures .ad-slot's top offset, its own height, and #stage's height, across a turn transition on
// the 5 ads-bearing game pages (the .ad-slot element in GameLayout.astro, which sits in #how-to-play, a
// SIBLING of .play-area, so any height change inside #stage/.play-area shifts it, per ADR-0044).
//
// Confirmed against the manifest, not trusted from the brief:
//   grep -n "ads:" src/games/*.ts  ->  daily-fortune/love-match/short-stick/timebomb/siamsi = true,
//   pick-loser = false. Matches this script's PAGE_CONFIG exactly; no mismatch to report.
//
// READ-ONLY — makes no src/ changes.
//
// STATUS: MANUAL / NOT WIRED, deliberately (docs/adr/0044-a-live-region-above-the-ad-slot-reserves-a-bound-not-a-floor.md,
// gh#120 open). Per the DELIBERATELY NOT WIRED rule in the header of scripts/ci-probes.sh: "Not wired because they exist; wired only
// when a probe's red would mean a regression in THIS repo." The thing this probe measures is
// font-metric-dependent — ADR-0044 §Context: this site ships no fonts, so rendered text heights
// belong to the visitor's OS, and the SAME transition measured 0px delta on one platform and -9px on
// another with zero source change in between. A CI gate on it would flap on runner font updates, not
// on a regression here — so it stays a hand-run probe, re-run when a page's layout or copy changes.
//
// Ports are assigned per docs/runbook.md ("Two headless probes at once attach to each other's
// browser") — this repo's convention is env-set ports, never a script default; driver.mjs already
// reads CDP_PORT itself. Run (verification wave, gh#120 follow-up):
//   npm run build && npx serve dist/ -l 4455 & SERVE_PID=$!
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     --headless --disable-gpu --no-sandbox --remote-debugging-port=9455 \
//     --user-data-dir=<scratch>/adslot-game-prof & CHROME_PID=$!
//   trap 'kill "$SERVE_PID" "$CHROME_PID" 2>/dev/null || true' EXIT
//   CDP_PORT=9455 PROBE_BASE=http://localhost:4455 node scripts/ad-slot-game-probe.mjs [--selftest]
// The trap is not optional. Both processes above are backgrounded, this script spawns neither and so
// tears down neither, and an orphan still holding 4455/9455 makes the NEXT run measure the previous
// build and report a false pass — the same hazard scripts/ci-probes.sh traps unconditionally.
// (direct run self-spawns scripts/driver.mjs; `node scripts/driver.mjs scripts/ad-slot-game-probe.mjs`
// also works and prints the same JSON, just without the --selftest CLI verdict below.)
//
// "Settled" (docs/agents/browser-verification.md, "settle before the baseline read"): a read is taken
// only once .ad-slot's top+height AND #stage's height have all held within 0.05px across 5 consecutive
// requestAnimationFrame ticks — never a fixed sleep, and never mid-transition.
//
// Every verdict below is a MEASURED BOUND with the platform named (see the return), never a universal
// ("never reflows") — ADR-0044's own discipline.

import { HEADER_NAME_MAX } from '../src/games/love-match.ts';

const BASE = process.env.PROBE_BASE || process.env.BASE || 'http://localhost:4321';
const WIDTHS = [320, 390];
const MAX_TRANSITIONS = 3;
const SELFTEST_SHIFT_PX = 137; // an odd, deliberately non-round number so a coincidental match is implausible
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n) => (typeof n === 'number' ? Math.round(n * 100) / 100 : n);

// ---- settle-before-read, extended to also carry .ad-slot's own height and #stage's height ----
const SETTLE_SNIPPET = `
  return await new Promise((resolve) => {
    let lastTop = null, lastAdH = null, lastStageH = null, stable = 0, frames = 0;
    function tick() {
      frames++;
      const ad = document.querySelector('.ad-slot');
      if (!ad) { resolve({ missing: true }); return; }
      const stage = document.getElementById('stage');
      const r = ad.getBoundingClientRect();
      // top offset: getBoundingClientRect().top PLUS window.scrollY (document-relative), so a scroll
      // during a round cannot be mistaken for the slot itself moving.
      const top = r.top + window.scrollY;
      const adH = r.height;
      const stageH = stage ? stage.getBoundingClientRect().height : null;
      const closeTop = lastTop !== null && Math.abs(top - lastTop) < 0.05;
      const closeAdH = lastAdH !== null && Math.abs(adH - lastAdH) < 0.05;
      const closeStageH = stageH === null || (lastStageH !== null && Math.abs(stageH - lastStageH) < 0.05);
      stable = (closeTop && closeAdH && closeStageH) ? stable + 1 : 0;
      lastTop = top; lastAdH = adH; lastStageH = stageH;
      if (stable >= 5 || frames > 240) { resolve({ top, adHeight: adH, stageHeight: stageH, timedOut: frames > 240 }); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
`;

async function settledMetrics(session) {
  const r = await session.evaluate(SETTLE_SNIPPET);
  if (r.error) return { error: r.error };
  return { value: r.value };
}

// Waits (up to 1.5s — ARM_DELAY_MS is 400ms per src/games/_arm-gate.ts, plus margin) for a button
// inside #stage that armAllButtons has not disabled, then clicks it. This is the one action every one
// of the 5 games' turn-advancing controls share: short-stick's stick buttons carry no shared class,
// but every named CTA across all five modules (start/draw/pass/again) is the first (and often only)
// enabled button in document order — so "click the first enabled button in #stage" is one generic
// driver for all five games' turn transitions instead of five bespoke ones.
async function clickFirstEnabledStageButton(session) {
  const res = await session.evaluate(`
    const deadline = Date.now() + 1500;
    let btn = null;
    while (Date.now() < deadline) {
      btn = document.querySelector('#stage button:not([disabled])');
      if (btn) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!btn) return { found: false };
    const label = (btn.textContent || '').trim();
    btn.click();
    return { found: true, label };
  `);
  if (res.error) return { found: false, error: res.error };
  return res.value;
}

// ---- Per-page seeding ----

async function seedParty(session, path, width, names) {
  const url = `${BASE}${path}`;
  await session.nav(url);
  await session.setWidth(width, 1600);
  await session.wipe();
  await session.evaluate(`localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(names))}); return true;`);
  await session.nav(url); // reload ON-ORIGIN after the wipe (browser-verification.md trap #4)
  await session.setWidth(width, 1600);
  const res = await session.evaluate(`
    const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
    for (const b of boxes) if (!b.checked) b.click();
    const btn = document.getElementById('start-round');
    if (!btn) return { missing: true };
    btn.click(); // dispatches watduang:start with the real ticked roster, same as a real tap
    return { missing: false };
  `);
  if (res.error) return `seedParty evaluate error: ${res.error}`;
  if (res.value?.missing) return '#start-round not found';
  await sleep(700); // the module is lazy-imported; give mountInto() a beat to run
  return null;
}

async function seedSolo(session, path, width) {
  const url = `${BASE}${path}`;
  await session.nav(url);
  await session.setWidth(width, 1600);
  await session.wipe();
  await session.nav(url);
  await session.setWidth(width, 1600);
  await sleep(700); // isSolo branch mounts via an async IIFE (dynamic import) — give it a beat
  return null;
}

async function fillDailyFortuneName(session) {
  await session.evaluate(`
    const input = document.getElementById('df-name');
    if (input) input.value = 'ทดสอบชื่อ';
    return true;
  `);
}

// love-match's shipped isSolo wiring hands game.mount() a hardcoded soloSession whose `players` is
// ALWAYS [] (src/pages/game/[id].astro's soloSession literal) — never read from localStorage or
// anywhere else. renderPick() in src/games/love-match.ts requires roster.length >= 2 or it renders a
// static "need 2+ people" message and returns, with NO button in #stage at all. That means love-match's
// pick/result screens — including the HEADER_STYLE code path the brief asks about — are UNREACHABLE
// through the real shipped UI today. This is a disclosed, pre-existing gap (the GameModule declaration in love-match.ts carries its own
// comment: "content redesign is the เนื้อคู่ ticket, which this ticket unblocks"), not something this
// probe introduces.
//
// To measure the real code anyway, this loads the already-fetched compiled module chunk (the page's own
// isSolo branch already dynamic-imports it on mount — found via performance.getEntriesByType, never a
// hardcoded build hash) and calls its mount() directly with a synthetic ctx carrying real player names.
// This bypasses the shell's session wiring on purpose; it does not touch src/**.
const LOVE_MATCH_CHUNK_RE = /\/_astro\/love-match\.[A-Za-z0-9_-]+\.js(?:\?.*)?$/;

async function mountLoveMatchDirect(session, names) {
  const res = await session.evaluate(`
    const entries = performance.getEntriesByType('resource').map((e) => e.name);
    const match = entries.find((u) => ${LOVE_MATCH_CHUNK_RE}.test(u));
    if (!match) return { missing: true, reason: 'love-match chunk not found in performance entries' };
    const mod = await import(match);
    if (!mod.default || typeof mod.default.mount !== 'function') return { missing: true, reason: 'module has no default.mount' };
    const stage = document.getElementById('stage');
    if (!stage) return { missing: true, reason: '#stage not found' };
    const ctx = {
      roster: { names: () => [], add: async () => {} },
      session: {
        players: ${JSON.stringify(names)},
        setPlayers() {}, played: [], markPlayed() {},
        checkpoint: null, saveCheckpoint() {}, clear() {},
      },
    };
    mod.default.dispose(); // no-op before a first mount, same as the real page's own first mount
    mod.default.mount(stage, ctx);
    return { missing: false };
  `);
  if (res.error) return `mountLoveMatchDirect evaluate error: ${res.error}`;
  if (res.value?.missing) return `mountLoveMatchDirect: ${res.value.reason}`;
  return null;
}

async function seedLoveMatch(session, width, names) {
  const url = `${BASE}/game/love-match/`;
  await session.nav(url);
  await session.setWidth(width, 1600);
  await session.wipe();
  await session.nav(url);
  await session.setWidth(width, 1600);
  await sleep(700); // let the real (dead-end) isSolo mount finish first, so the chunk is fetched
  return mountLoveMatchDirect(session, names);
}

// ---- Per-page config ----
const PAGE_CONFIG = {
  'daily-fortune': { kind: 'solo', path: '/game/daily-fortune/', afterSeed: fillDailyFortuneName },
  'love-match': { kind: 'lovematch', names: ['เอ', 'บี'] },
  'short-stick': { kind: 'party', path: '/game/short-stick/', names: ['เอ', 'บี', 'ซี'] },
  timebomb: { kind: 'party', path: '/game/timebomb/', names: ['เอ', 'บี', 'ซี'] },
  siamsi: { kind: 'solo', path: '/game/siamsi/' },
};
const PAGES = Object.keys(PAGE_CONFIG);

async function measurePageTransitions(session, page, width) {
  const cfg = PAGE_CONFIG[page];
  let seedErr = null;
  if (cfg.kind === 'party') seedErr = await seedParty(session, cfg.path, width, cfg.names);
  else if (cfg.kind === 'solo') {
    seedErr = await seedSolo(session, cfg.path, width);
    if (!seedErr && cfg.afterSeed) await cfg.afterSeed(session);
  } else if (cfg.kind === 'lovematch') seedErr = await seedLoveMatch(session, width, cfg.names);
  if (seedErr) return { page, width, verdict: 'FAIL(unmeasurable)', reason: seedErr, transitions: [] };

  const transitions = [];
  for (let i = 0; i < MAX_TRANSITIONS; i++) {
    const before = await settledMetrics(session);
    if (before.error) return { page, width, verdict: 'FAIL(unmeasurable)', reason: before.error, transitions };
    if (before.value?.missing) return { page, width, verdict: 'FAIL(unmeasurable)', reason: `.ad-slot not found before transition ${i + 1}`, transitions };

    const click = await clickFirstEnabledStageButton(session);
    if (!click.found) break; // no more controls to advance — the round ended; not a failure

    const after = await settledMetrics(session);
    if (after.error) return { page, width, verdict: 'FAIL(unmeasurable)', reason: after.error, transitions };
    if (after.value?.missing) return { page, width, verdict: 'FAIL(unmeasurable)', reason: `.ad-slot not found after transition ${i + 1}`, transitions };

    const b = before.value, a = after.value;
    transitions.push({
      n: i + 1,
      clickedLabel: click.label,
      beforeTop: round(b.top),
      afterTop: round(a.top),
      deltaPx: round(a.top - b.top),
      adHeightBefore: round(b.adHeight),
      adHeightAfter: round(a.adHeight),
      stageHeightBefore: round(b.stageHeight),
      stageHeightAfter: round(a.stageHeight),
      settled: !b.timedOut && !a.timedOut,
    });
  }
  const maxDeltaPx = transitions.length ? Math.max(...transitions.map((t) => Math.abs(t.deltaPx))) : 0;
  return {
    page, width, transitions, maxDeltaPx,
    verdict: transitions.length === 0 ? 'MEASURED(no-transition-reachable)' : transitions.every((t) => t.settled) ? 'MEASURED' : 'MEASURED(unsettled-read)',
  };
}

// ---- love-match's own question: does HEADER_STYLE in love-match.ts ever wrap past 2 lines? ----
async function loveMatchHeaderCase(session, width, caseLabel, name, viaLocalStorage) {
  const url = `${BASE}/game/love-match/`;
  await session.nav(url);
  await session.setWidth(width, 1600);
  await session.wipe();
  if (viaLocalStorage) {
    // Literal brief instruction: an old, uncapped localStorage roster entry can outlive today's input
    // maxlength. Written here so that state genuinely exists on disk — but per mountLoveMatchDirect's
    // comment above, love-match's shipped soloSession never reads this key, so it has no effect on the
    // real mount path. The direct-mount bypass below (same `name`, passed through the synthetic ctx) is
    // what actually exercises headerNameFor() with it.
    await session.evaluate(`localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify([name, 'คู่ทดสอบ']))}); return true;`);
  }
  await session.nav(url);
  await session.setWidth(width, 1600);
  await sleep(700);

  const before = await settledMetrics(session);
  const mountErr = await mountLoveMatchDirect(session, [name, 'คู่ทดสอบ']);
  if (mountErr) return { case: caseLabel, nameLength: name.length, error: mountErr };

  const res = await session.evaluate(`
    await new Promise((r) => setTimeout(r, 500)); // clear the 400ms arm-gate before the tap below
    const chip = document.querySelector('#stage button:not([disabled])');
    if (!chip) return { missing: true, reason: 'no enabled chip after mount' };
    chip.click(); // taps roster[0] — pick()'s first-tap branch rewrites headerEl.textContent in place
    const header = document.querySelector('#stage p');
    if (!header) return { missing: true, reason: 'no <p> header found in #stage' };
    const cs = getComputedStyle(header);
    const rect = header.getBoundingClientRect();
    const lineHeightPx = parseFloat(cs.lineHeight);
    const lines = Math.round(rect.height / lineHeightPx);
    return { missing: false, headerText: header.textContent, headerHeightPx: rect.height, lineHeightPx, lines };
  `);
  const after = await settledMetrics(session);

  if (res.error) return { case: caseLabel, nameLength: name.length, error: res.error };
  if (res.value?.missing) return { case: caseLabel, nameLength: name.length, error: res.value.reason };

  return {
    case: caseLabel,
    nameLength: name.length,
    headerText: res.value.headerText,
    lines: res.value.lines,
    exceedsTwoLines: res.value.lines > 2,
    adSlotDeltaPx: (before.value && after.value && !before.value.missing && !after.value.missing)
      ? round(after.value.top - before.value.top)
      : null,
  };
}

async function runLoveMatchHeaderTest(session, width) {
  const shortName = 'แนน';
  const exactName = 'ก'.repeat(HEADER_NAME_MAX); // exactly HEADER_NAME_MAX chars — the boundary itself
  const overName = 'ก'.repeat(HEADER_NAME_MAX + 20); // well past the cap, and via localStorage per the brief
  return [
    await loveMatchHeaderCase(session, width, 'a-short-name', shortName, false),
    await loveMatchHeaderCase(session, width, 'b-exact-HEADER_NAME_MAX', exactName, false),
    await loveMatchHeaderCase(session, width, 'c-over-HEADER_NAME_MAX-via-localStorage', overName, true),
  ];
}

// ---- Calibration (--selftest / SELFTEST=1) ----
// Follows scripts/ad-slot-grid-probe.mjs's calibrate(): injects a synthetic button directly above
// .ad-slot whose click either does nothing (clean leg) or inserts a KNOWN-height block above .ad-slot
// (shifted leg) — deterministic, so it does not depend on any real page's legitimate content deltas
// (a game screen legitimately growing/shrinking is not itself a defect; only this fixed, known
// injection is being asserted on).
async function calibrateLeg(session, arm) {
  const url = `${BASE}/game/daily-fortune/`;
  await session.nav(url);
  await session.setWidth(320, 1600);
  await session.wipe();
  await session.nav(url);
  await session.setWidth(320, 1600);
  await sleep(700);
  await session.evaluate(`
    const ad = document.querySelector('.ad-slot');
    const btn = document.createElement('button');
    btn.id = 'adslot-game-probe-selftest-btn';
    btn.type = 'button';
    btn.textContent = 'selftest';
    btn.style.cssText = 'display:block;width:100%;';
    btn.onclick = () => {
      ${arm ? `ad.insertAdjacentHTML('beforebegin', '<div data-selftest-mover style="height:${SELFTEST_SHIFT_PX}px"></div>');` : ''}
    };
    ad.parentNode.insertBefore(btn, ad);
    return true;
  `);
  const before = await settledMetrics(session);
  await session.evaluate(`document.getElementById('adslot-game-probe-selftest-btn').click(); return true;`);
  const after = await settledMetrics(session);
  if (before.error || after.error || before.value?.missing || after.value?.missing) {
    return { arm, verdict: 'FAIL(unmeasurable)', reason: before.error ?? after.error ?? 'ad-slot not found' };
  }
  const deltaPx = round(after.value.top - before.value.top);
  const verdict = arm
    ? (Math.abs(deltaPx - SELFTEST_SHIFT_PX) <= 2 ? 'FAIL' : 'PASS(unexpected: injected shift not detected)')
    : (Math.abs(deltaPx) < 1 ? 'PASS' : 'FAIL(unexpected baseline movement)');
  return { arm, deltaPx, expectedShiftPx: arm ? SELFTEST_SHIFT_PX : 0, verdict };
}

async function runSelftest(session) {
  const clean = await calibrateLeg(session, false);
  const shifted = await calibrateLeg(session, true);
  // The calibration invariant: clean must PASS (no baseline movement) and shifted must FAIL (the
  // known injected height IS detected) — a probe that cannot go red here has never proven anything.
  const overall = clean.verdict === 'PASS' && shifted.verdict === 'FAIL' ? 'PASS' : 'FAIL';
  return { selftest: true, clean, shifted, overall };
}

export default async function (session) {
  if (process.env.SELFTEST) return runSelftest(session);

  const results = { platform: null, pages: {}, loveMatchHeaderTest: null };
  const ua = await session.evaluate('return navigator.userAgent;');
  results.platform = ua.value;

  for (const width of WIDTHS) {
    results.pages[width] = {};
    for (const page of PAGES) {
      results.pages[width][page] = await measurePageTransitions(session, page, width);
    }
  }
  results.loveMatchHeaderTest = await runLoveMatchHeaderTest(session, 320);
  return results;
}

// Self-run: `node scripts/ad-slot-game-probe.mjs [--selftest]` drives THIS file through
// scripts/driver.mjs (never a second driver implementation) and, for --selftest, exits 1 with the
// failing leg printed unless the calibration invariant above holds.
const { fileURLToPath } = await import('node:url');
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { spawnSync } = await import('node:child_process');
  const driverPath = fileURLToPath(new URL('./driver.mjs', import.meta.url));
  const selfPath = fileURLToPath(import.meta.url);
  const selftest = process.argv.includes('--selftest');
  const env = { ...process.env, ...(selftest ? { SELFTEST: '1' } : {}) };
  const out = spawnSync('node', [driverPath, selfPath], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env });
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
  if (!selftest) {
    console.log(JSON.stringify(parsed, null, 2));
    process.exit(0);
  }
  console.log(`selftest clean:   deltaPx=${parsed.clean.deltaPx}  expected=${parsed.clean.expectedShiftPx}  verdict=${parsed.clean.verdict}`);
  console.log(`selftest shifted: deltaPx=${parsed.shifted.deltaPx}  expected=${parsed.shifted.expectedShiftPx}  verdict=${parsed.shifted.verdict}`);
  console.log(`selftest overall: ${parsed.overall}`);
  process.exit(parsed.overall === 'PASS' ? 0 : 1);
}
