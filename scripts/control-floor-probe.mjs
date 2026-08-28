#!/usr/bin/env node
// RENDERED floor gate for the shared game controls (gh#129, gate 1) — the tap-target companion to
// scripts/stick-tap-target-probe.mjs, which owns the same 44px minimum for short-stick's sticks only.
//
// THE INVARIANT, one sentence: on every game page, at 320px, every .game-btn that actually renders
// (a) resolves a computed min-height greater than zero, (b) has a getBoundingClientRect().height that
// is never below that resolved value, and (c) has a rect height never below the 44px tap minimum.
//
// GATE THE RELATIONSHIP, NOT THE PIXELS. Claims (a) and (b) carry NO height literal: the floor is read
// out of the rendered CSSOM and the rect is compared against whatever the page itself resolved. A
// rendered-height literal would belong to the visitor's OS and font (ADR-0044), and would flap on a
// runner font update. The single number in this file is MIN_TAP_PX, the one-sided accessibility spec
// constant this repo already gates on for gh#79 — a spec floor, not a measurement.
//
// WHY THIS CAN REGRESS HERE, and what each claim is worth:
//   * The floors are DECLARED nowhere the compiler can see them being used. They live in the
//     `<style is:global>` block of src/pages/game/[id].astro, on the .game-btn-primary and
//     .game-btn-secondary selectors (that block's own comment states why: game modules build this DOM
//     at runtime and Astro's default scoping would never reach it). Every .game-btn in the built site
//     is created by a game module's script — `grep game-btn dist/game/*/index.html` returns zero. So
//     dropping `is:global`, or renaming a class, or scoping that block, silently ships controls with
//     no floor at all and no build error anywhere. Claim (a) is the detector for exactly that.
//   * Claim (c) is the tap minimum. It reds when a floor survives but is set below 44, or when text
//     shrinks a floorless control under it.
//   * CLAIM (b) ALONE IS NEAR-TAUTOLOGICAL and is disclosed as such: CSS enforces min-height by
//     construction, so a rect can only fall under a live floor via a transform (or a clipped/scaled
//     ancestor). It is kept because that failure is real and invisible to (a) and (c), but claims (a)
//     and (c) are the load-bearing ones — do not read a green on (b) as coverage of anything else.
//
// THE PAGE SET IS DERIVED FROM src/games/manifest.ts, never hand-listed: every game in `games` gets
// its /game/<id>/ URL, and solo-vs-party seeding is derived from that module's own `players` tuple
// ([1, 1] is the ADR-0040 solo class, which renders no setup panel). A seventh game is covered the
// build after it lands. The navigation shape (seed the roster in localStorage, tick every box, click
// #start-round · or let the solo branch mount itself) is the one in scripts/ad-slot-game-probe.mjs,
// plus pick-loser, which that probe skips because it carries no ad slot — it is included here because
// it is the ONLY page that renders a .game-btn-secondary, i.e. the only page where the 56px floor is
// measurable at all.
//
// EACH PAGE IS WALKED TWO SCREENS DEEP (seeded screen, then one click on the first enabled #stage
// button), because several games' controls only exist after a transition: daily-fortune's screen 1 has
// no .game-btn at all, and pick-loser's secondary lives on its result screen.
//
// WHAT ITS GREEN DOES NOT MEAN. 320px only — 390px is UNMEASURED here, deliberately: 320 is the
// binding width (a floor that holds at 320 holds wider, and every layout hazard in this repo has
// surfaced at 320 first). Two screens per page, not every screen; one browser; and love-match
// contributes ZERO controls — it has no page at all any more. It was delisted pending its "เนื้อคู่"
// redesign, so this manifest-driven walk never reaches it. It contributed zero before the delisting
// too, for a different reason: its solo wiring handed mount() an empty roster and the pick screen
// rendered a buttonless "need 2+ people" message. CONTROL_COUNT is unchanged either way, so a green
// here says nothing about that game — scripts/ad-slot-game-probe.mjs still reaches its code, by
// mounting the chunk directly rather than by visiting a page.
//
// WIRED as a ci-probes leg (a red = a floor that stopped reaching JS-created controls, or a control
// below the tap minimum — both regressions in THIS repo). Not --selftest-audited: it lives behind the
// ci-probes.sh wrapper, already named in gate-selftest-coverage-check's unauditableCommands; its
// calibration is the control leg.
//
//   node scripts/control-floor-probe.mjs               -> exit non-zero on any control failing any claim
//   BREAK_FLOOR=1 node scripts/control-floor-probe.mjs -> control: CSSOM-injects three mutants; exit 0
//                                                         ONLY if all three claims red on EVERY control
//
// It also default-exports a driver.mjs probe, so `node scripts/driver.mjs scripts/control-floor-probe.mjs`
// yields the raw JSON for a ci-probes.sh leg. Run directly, it spawns that itself and owns the verdict.
// Serve an ALREADY-BUILT dist/ on BASE and start Chrome on CDP_PORT first; this leg must never build.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { games } from '../src/games/manifest.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const DIST = path.join(repoRoot, 'dist');
// Own ports, deliberately not any other script's: the neighbouring browser probes hold 4455/9455, and
// 4321 is a peer project's dev server. Probing a foreign server or browser is how a green gets
// reported for someone else's bytes.
const BASE = process.env.BASE || process.env.PROBE_BASE || 'http://localhost:4580';
const CDP_PORT = process.env.CDP_PORT || '9580';
const WIDTH = Number(process.env.PROBE_WIDTH || 320);
const BREAK_FLOOR = Boolean(process.env.BREAK_FLOOR);

/** The one-sided accessibility spec constant this repo already gates on (gh#79). Not a measurement. */
export const MIN_TAP_PX = 44;
/** Subpixel tolerance — a rect and a resolved floor can disagree in the last fraction of a device px. */
const EPS = 0.05;

// RECORDED FROM THE FIRST GREEN RUN on the real dist/, not derived by grep: per-screen subsets render,
// so no static count of `className = 'game-btn ...'` assignments predicts it. A CHANGE IN THIS NUMBER
// IS THE INTENDED SIGNAL — a control that stopped rendering, a new one that started, or a screen that
// stopped being reachable. Re-record it deliberately, with the reason, never to make a run pass.
// First green run, as a breakdown so a future drift is attributable: timebomb 1+1, siamsi 1+1,
// pick-loser 1 + (1 primary + 1 secondary), short-stick 0+1, daily-fortune 0+1, love-match 0.
export const CONTROL_COUNT = 9;
/** Every game in the manifest gets a page. Pinned so a page that stopped loading cannot read as clean. */
export const PAGE_COUNT = games.length;

const NAMES = ['เอ', 'บี', 'ซี'];
const STYLE_ID = 'control-floor-probe-mutant';

// The three mutants, CSSOM-injected and removed in the same evaluate: zero checkout mutation, nothing
// to revert. `floorless` is the lost-is:global regression in miniature (no floor, and small enough
// that the rendered box also drops under the tap minimum); `squashed` is the only way a rect can fall
// under a floor that is still live.
export const MUTANTS = {
  floorless: '.game-btn { min-height: 0 !important; padding: 0; font-size: 8px }',
  squashed: '.game-btn { transform: scaleY(.25) }',
};

/** The three claims for one measured control. Pure, so the control leg asserts on the same code path. */
export function claimsFor(c) {
  const floor = Number.isFinite(c.floorPx) ? c.floorPx : 0;
  return {
    hasFloor: floor > 0,
    atLeastFloor: c.rectHeight >= floor - EPS,
    atLeastTap: c.rectHeight >= MIN_TAP_PX - EPS,
  };
}

/** The page set and its seeding kind, both derived from the manifest. */
export function pageSet() {
  return games.map((g) => ({
    id: g.id,
    url: `/game/${g.id}/`,
    // ADR-0040: a [1, 1] page renders no setup panel, so there is no #start-round to click and the
    // page's own solo branch mounts the module straight into the stage.
    kind: g.players[0] === 1 && g.players[1] === 1 ? 'solo' : 'party',
  }));
}

const measureExpr = (mutantCss) => `
  const stale = document.getElementById(${JSON.stringify(STYLE_ID)});
  if (stale) stale.remove();
  ${mutantCss
    ? `const s = document.createElement('style');
       s.id = ${JSON.stringify(STYLE_ID)};
       document.head.appendChild(s);
       s.sheet.insertRule(${JSON.stringify(mutantCss)}, 0);`
    : ''}
  // two frames: one for the injected rule to take effect, one for layout to settle before the read
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const out = [...document.querySelectorAll('.game-btn')].map((b) => {
    const cs = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    return {
      name: b.id ? '#' + b.id : b.className,
      variant: b.classList.contains('game-btn-secondary') ? 'secondary'
        : b.classList.contains('game-btn-primary') ? 'primary' : 'bare',
      minHeight: cs.minHeight,
      floorPx: Number.parseFloat(cs.minHeight),
      rectHeight: r.height,
      disabled: !!b.disabled,
    };
  });
  const planted = document.getElementById(${JSON.stringify(STYLE_ID)});
  if (planted) planted.remove();
  return out;
`;

const WAIT_FOR_CONTROLS = `
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && document.querySelectorAll('.game-btn').length === 0) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return document.querySelectorAll('.game-btn').length;
`;

// The one action every game's screen-1 control shares: the first enabled button in #stage. Waits out
// the 400ms arm gate (src/games/_arm-gate.ts) plus margin before giving up.
const CLICK_FIRST_ENABLED = `
  const deadline = Date.now() + 1500;
  let btn = null;
  while (Date.now() < deadline) {
    btn = document.querySelector('#stage button:not([disabled])');
    if (btn) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!btn) return { found: false };
  btn.click();
  return { found: true, label: (btn.textContent || '').trim() };
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed(session, page) {
  const url = `${BASE}${page.url}`;
  await session.nav(url);
  await session.setWidth(WIDTH, 1600);
  await session.wipe();
  if (page.kind === 'party') {
    await session.evaluate(
      `localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(NAMES))}); return true;`,
    );
  }
  await session.nav(url); // reload ON-ORIGIN after the wipe (docs/agents/browser-verification.md)
  await session.setWidth(WIDTH, 1600);
  if (page.kind === 'party') {
    const res = await session.evaluate(`
      const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
      for (const b of boxes) if (!b.checked) b.click();
      const btn = document.getElementById('start-round');
      if (!btn) return { missing: true };
      btn.click(); // dispatches watduang:start with the real ticked roster, same as a real tap
      return { missing: false };
    `);
    if (res.error) return `seed evaluate error: ${res.error}`;
    if (res.value?.missing) return '#start-round not found';
  }
  await sleep(700); // the module is lazy-imported; give mountInto() a beat
  if (page.id === 'daily-fortune') {
    // screen 1 needs a name before its (non-.game-btn) submit will advance to the result screen
    await session.evaluate(`
      const input = document.getElementById('df-name');
      if (input) input.value = 'ทดสอบชื่อ';
      return true;
    `);
  }
  return null;
}

async function measureScreen(session, page, screen) {
  await session.evaluate(WAIT_FOR_CONTROLS);
  const clean = await session.evaluate(measureExpr(null));
  if (clean.error) return { page: page.id, screen, error: clean.error };
  const row = { page: page.id, screen, error: null, controls: clean.value ?? [] };
  if (BREAK_FLOOR) {
    for (const [name, css] of Object.entries(MUTANTS)) {
      const m = await session.evaluate(measureExpr(css));
      if (m.error) return { page: page.id, screen, error: `mutant ${name}: ${m.error}` };
      row[name] = m.value ?? [];
    }
  }
  return row;
}

/** driver.mjs probe: walk every manifest page two screens deep at WIDTH and report what rendered. */
export default async function (session) {
  const pages = pageSet();
  const screens = [];
  for (const page of pages) {
    const seedErr = await seed(session, page);
    if (seedErr) {
      screens.push({ page: page.id, screen: 1, error: seedErr, controls: [] });
      continue;
    }
    screens.push(await measureScreen(session, page, 1));
    const click = await session.evaluate(CLICK_FIRST_ENABLED);
    if (click.error) {
      screens.push({ page: page.id, screen: 2, error: click.error, controls: [] });
      continue;
    }
    if (!click.value?.found) continue; // no reachable transition — not a failure, just fewer screens
    await sleep(400);
    screens.push(await measureScreen(session, page, 2));
  }
  return {
    base: BASE,
    width: WIDTH,
    breakFloor: BREAK_FLOOR,
    pagesWalked: new Set(screens.map((s) => s.page)).size,
    screens,
  };
}

const violationMsg = (s, c, k) => {
  const where = `${c.name} (${c.variant}) on /game/${s.page}/ screen ${s.screen} at ${WIDTH}px`;
  if (!k.hasFloor) {
    return `${where} resolves NO computed min-height floor (computed: ${c.minHeight}). The floors for .game-btn-primary/.game-btn-secondary are declared in the <style is:global> block of src/pages/game/[id].astro, and every .game-btn in the built site is created by a game module at runtime — so a floor that stops reaching them means that block stopped being global, or the class was renamed. Nothing else in the build can see this.`;
  }
  if (!k.atLeastFloor) {
    return `${where} renders ${c.rectHeight}px, BELOW its own resolved min-height of ${c.minHeight} — CSS cannot do that on its own, so something is transforming, scaling or clipping the control.`;
  }
  return `${where} renders ${c.rectHeight}px, under the ${MIN_TAP_PX}px tap minimum this repo gates on (gh#79). Its resolved floor is ${c.minHeight}.`;
};

function main() {
  // Probes an existing build and must never make one: measuring a freshly regenerated dist/ is not
  // measuring the bytes that get deployed.
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('::error::dist/index.html not found — this leg measures an existing build and must never make one. Run it after the build.');
    process.exit(1);
  }

  const run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/driver.mjs'), fileURLToPath(import.meta.url)], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, CDP_PORT, BASE },
  });
  if (run.status !== 0) {
    console.error(`::error::the browser leg did not run (exit ${run.status}). Serve dist/ on ${BASE} and start Chrome with --remote-debugging-port=${CDP_PORT} first.\n${(run.stderr || '').trim()}`);
    process.exit(1);
  }
  let out;
  try {
    out = JSON.parse(run.stdout);
  } catch {
    console.error(`::error::the browser leg produced no parseable JSON:\n${run.stdout.slice(0, 500)}`);
    process.exit(1);
  }

  // Fail closed on every way this can measure nothing while looking clean.
  const broken = out.screens.filter((s) => s.error);
  for (const s of broken) console.error(`::error::/game/${s.page}/ screen ${s.screen} did not measure: ${s.error}`);
  if (broken.length) process.exit(1);

  if (out.pagesWalked !== PAGE_COUNT) {
    console.error(`::error::walked ${out.pagesWalked} game page(s), expected ${PAGE_COUNT} (every game in src/games/manifest.ts) — a page that never loaded reads exactly like a clean one.`);
    process.exit(1);
  }
  const controlsMeasured = out.screens.reduce((n, s) => n + s.controls.length, 0);
  if (controlsMeasured !== CONTROL_COUNT) {
    console.error(`::error::measured ${controlsMeasured} rendered .game-btn control(s), expected ${CONTROL_COUNT}. This count is the intended signal: a control stopped rendering, a new one started, or a screen stopped being reachable. Find out which, then re-record CONTROL_COUNT with the reason — never to make a run pass.`);
    process.exit(1);
  }

  if (BREAK_FLOOR) {
    // Control leg: the expected outcome is INVERTED, and every mutant must red on EVERY control — a
    // mutant that reds on some of them is a detector with a blind spot, not a calibration.
    const tally = (key, claim) =>
      out.screens.reduce((n, s) => n + (s[key] ?? []).filter((c) => !claimsFor(c)[claim]).length, 0);
    const legs = [
      { claim: 1, label: `floorless mutant -> claim 1 (a floor resolves)`, got: tally('floorless', 'hasFloor') },
      { claim: 3, label: `floorless mutant -> claim 3 (rect >= ${MIN_TAP_PX}px)`, got: tally('floorless', 'atLeastTap') },
      { claim: 2, label: `squashed mutant  -> claim 2 (rect >= resolved floor)`, got: tally('squashed', 'atLeastFloor') },
    ];
    let bad = false;
    for (const leg of legs) {
      const ok = leg.got === controlsMeasured;
      if (!ok) bad = true;
      console.log(`${ok ? 'RED as expected' : 'NOT RED'}: ${leg.label} — ${leg.got}/${controlsMeasured} control(s)`);
    }
    if (bad) {
      console.error('::error::BREAK_FLOOR did not red all three claims on every measured control — the detector cannot see the hazards it exists to catch.');
      process.exit(1);
    }
    console.log(`OK control: all three claims red on all ${controlsMeasured} control(s) across ${out.pagesWalked} game page(s) at ${out.width}px (mutants CSSOM-injected and removed; no file changed).`);
    return;
  }

  const violations = [];
  for (const s of out.screens) {
    for (const c of s.controls) {
      const k = claimsFor(c);
      if (!k.hasFloor || !k.atLeastFloor || !k.atLeastTap) violations.push(violationMsg(s, c, k));
    }
  }
  for (const v of violations) console.error(`::error::${v}`);
  if (violations.length) {
    console.error(`\n${violations.length} of ${controlsMeasured} rendered .game-btn control(s) fail a floor claim at ${out.width}px.`);
    process.exit(1);
  }
  console.log(`OK ${controlsMeasured} rendered .game-btn control(s) across ${out.pagesWalked} game page(s) at ${out.width}px: every one resolves a non-zero min-height, renders at or above it, and clears the ${MIN_TAP_PX}px tap minimum.`);
}

// Entry point only — driver.mjs imports this module for its default export, and that must not fire
// the gate (which would spawn driver.mjs again, recursively).
const isEntryPoint = () => {
  if (!process.argv[1]) return false;
  const canonical = (p) => pathToFileURL(fs.realpathSync(p)).href;
  try {
    return canonical(process.argv[1]) === canonical(fileURLToPath(import.meta.url));
  } catch {
    return true;
  }
};
if (isEntryPoint()) main();
