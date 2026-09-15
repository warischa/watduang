// gh#181 — fresh 1440x900 screenshots of all eight in-scope play routes, against the CURRENT tree.
// Reuses proven idioms rather than re-inventing them:
//   - the text-signature walk + largest-non-header-button-first heuristic from
//     scripts/play-screen-fit-probe.mjs (SIGNATURE, SEED, click-largest), duplicated here in
//     minimal form because that file does not export its internals and is a load-bearing CI gate
//     this task must not touch.
//   - the explicit #dl-begin / #tb-begin + #tb-start control sequence from
//     docs/verification/evidence/181-clean-screen/clean-screen-probe.mjs, which avoids the
//     largest-button heuristic hitting dice-loser's/timebomb's reset control and landing on a
//     screen with the reset confirm dialog open.
//
// Driven via scripts/driver.mjs against an already-built dist/ — this script never builds.
// Usage: CDP_PORT=9711 BASE=http://localhost:4711 node scripts/driver.mjs \
//          docs/verification/evidence/181/capture-1440-screenshots.mjs > <log path>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const BASE = process.env.BASE || 'http://localhost:4711';
const OUT_DIR = fileURLToPath(new URL('.', import.meta.url));
const VP = { w: 1440, h: 900 };
const NAMES = ['QQAAX', 'QQBBY', 'QQCCZ']; // same synthetic-roster idiom as play-screen-fit-probe.mjs
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HELPERS = `
  const ROOT_SEL = '#app, #app-container, #appRoot';
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
`;

const SIGNATURE = `
  ${HELPERS}
  const root = document.querySelector(ROOT_SEL);
  if (!root) return { ok: false, why: 'no mockup root' };
  const parts = [];
  for (const e of root.querySelectorAll('*')) {
    if (e.children.length || !visible(e)) continue;
    const t = (e.textContent || '').trim();
    if (t) parts.push(t);
  }
  const sig = parts.join(' ').toLowerCase().replace(/[0-9\\u0E50-\\u0E59]+/g, '').replace(/\\s+/g, ' ').trim();
  return { ok: true, sig };
`;

const SEED = `
  localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(NAMES))});
  localStorage.setItem('watduang:group', ${JSON.stringify(JSON.stringify(NAMES))});
  return true;
`;

const clickLargest = (skip) => `
  ${HELPERS}
  const root = document.querySelector(ROOT_SEL);
  if (!root) return { found: false, why: 'no mockup root' };
  const cands = [...root.querySelectorAll('button:not([disabled])')].filter((b) => {
    const r = b.getBoundingClientRect();
    return r.width > 60 && r.height > 30 && r.top >= 0 && !b.closest('header') && visible(b);
  }).sort((a, z) => {
    const ra = a.getBoundingClientRect(), rz = z.getBoundingClientRect();
    return rz.width * rz.height - ra.width * ra.height;
  });
  const btn = cands[${JSON.stringify(skip)}];
  if (!btn) return { found: false, why: 'nothing left to press at rank ${skip}' };
  btn.click();
  return { found: true, label: (btn.textContent || '').trim().slice(0, 40) };
`;

const DIALOG_CHECK = `
  const all = [...document.querySelectorAll('dialog')];
  return {
    allDialogIds: all.map((d) => d.id || '(no id)'),
    openDialogIds: all.filter((d) => d.open).map((d) => d.id || '(no id)'),
  };
`;

async function assertViewport(session) {
  const v = await session.evaluate('return { innerWidth, innerHeight };');
  if (v.value?.innerWidth !== VP.w || v.value?.innerHeight !== VP.h) {
    throw new Error(`viewport not reflowed: got ${JSON.stringify(v.value)}, wanted ${VP.w}x${VP.h}`);
  }
  return v.value;
}

// Generic walk: fresh screen (no roster) -> seed a roster -> reach a screen whose text signature
// differs from fresh, using the largest-non-header-button-first heuristic. `until` lets a route
// require pressing PAST the first non-fresh screen (freeze-tap's pass-the-device interstitial).
async function genericWalk(session, url, { pressCap = 4, until = null } = {}) {
  await session.nav(url);
  await session.setWidth(VP.w, VP.h);
  await session.wipe();
  await session.nav(url);
  await session.setWidth(VP.w, VP.h);
  await sleep(1200);
  await assertViewport(session);
  const fresh = (await session.evaluate(SIGNATURE)).value;

  await session.evaluate(SEED);
  await session.nav(url);
  await session.setWidth(VP.w, VP.h);
  await sleep(1200);
  await assertViewport(session);

  let skip = 0;
  const presses = [];
  for (let i = 0; i <= pressCap; i += 1) {
    const sig = (await session.evaluate(SIGNATURE)).value;
    const left = sig?.sig !== fresh?.sig;
    const untilOk = until ? (await session.evaluate(until)).value : true;
    if (left && untilOk) break;
    if (i === pressCap) break;
    const click = (await session.evaluate(clickLargest(skip))).value;
    if (!click?.found) { skip += 1; if (skip > 5) break; continue; }
    presses.push(click.label);
    await sleep(700);
    const sigAfter = (await session.evaluate(SIGNATURE)).value;
    skip = sigAfter?.sig === sig?.sig ? skip + 1 : 0; // no change -> try the next-largest next time
  }
  return { presses, freshLen: fresh?.sig?.length ?? 0 };
}

const ROUTES = {
  // Attempt 1 landed these three on their own "pass the device to X" handoff card (a screen that IS
  // already different from the fresh signature, so the walk stopped there) rather than the real
  // interactive screen one further press reaches. Gated the same way freeze-tap already needed to be.
  'power-meter': {
    url: `${BASE}/game/power-meter/play/`,
    pressCap: 4,
    // renderAttemptView's ".meter-arena" is present regardless of the tap/running/result sub-state;
    // renderTurnIntroView (the pass-device card) never renders it.
    until: `return !!document.querySelector('.meter-arena');`,
  },
  'zero-trigger': { url: `${BASE}/game/zero-trigger/play/` },
  'cannon-flag': {
    url: `${BASE}/game/cannon-flag/play/`,
    pressCap: 4,
    // #screen-gameplay must be the ACTIVE screen, not merely present in the DOM — all four static
    // screens exist at once and only .active is shown (src/play/cannon-flag/main.js showScreen()).
    until: `return document.getElementById('screen-gameplay')?.classList.contains('active') ?? false;`,
  },
  'pinocchio-luck': {
    url: `${BASE}/game/pinocchio-luck/play/`,
    pressCap: 4,
    // renderQuestion's answer buttons; renderPass (the "ready" handoff card) has no ".answers".
    until: `return !!document.querySelector('.answers');`,
  },
  'short-stick': { url: `${BASE}/game/short-stick/play/` },
  'freeze-tap': {
    url: `${BASE}/game/freeze-tap/play/`,
    pressCap: 4,
    // must reach the round screen (#gameTargetSurface), not stop at the pass-the-device interstitial
    until: `return !!document.getElementById('gameTargetSurface');`,
  },
};

async function captureGeneric(session, id, cfg, log) {
  const walk = await genericWalk(session, cfg.url, { pressCap: cfg.pressCap ?? 4, until: cfg.until });
  const vp = await assertViewport(session);
  const dlg = (await session.evaluate(DIALOG_CHECK)).value;
  const shotPath = path.join(OUT_DIR, `${id}-1440x900.png`);
  await session.screenshot(shotPath);
  log[id] = {
    method: cfg.until
      ? 'seeded-roster generic walk, largest-non-header-button-first, gated on #gameTargetSurface'
      : 'seeded-roster generic walk, largest-non-header-button-first (first screen off the fresh signature)',
    presses: walk.presses,
    viewport: vp,
    dialogs: dlg,
    shot: path.relative(repoRoot, shotPath),
  };
}

async function captureDiceLoser(session, log) {
  const url = `${BASE}/game/dice-loser/play/`;
  await session.nav(url); await session.setWidth(VP.w, VP.h); await session.wipe();
  await session.nav(url); await session.setWidth(VP.w, VP.h); await sleep(600);
  await session.evaluate(`document.querySelector('#dl-begin')?.click(); return true;`);
  await sleep(500);
  const vp = await assertViewport(session);
  const dlg = (await session.evaluate(DIALOG_CHECK)).value;
  const shotPath = path.join(OUT_DIR, `dice-loser-1440x900.png`);
  await session.screenshot(shotPath);
  log['dice-loser'] = {
    method: 'explicit #dl-begin click (never the reset button) — same control a player presses',
    viewport: vp,
    dialogs: dlg,
    shot: path.relative(repoRoot, shotPath),
  };
}

async function captureTimebomb(session, log) {
  const url = `${BASE}/game/timebomb/play/`;
  await session.nav(url); await session.setWidth(VP.w, VP.h); await session.wipe();
  await session.nav(url); await session.setWidth(VP.w, VP.h); await sleep(600);
  await session.evaluate(`document.querySelector('#tb-begin')?.click(); return true;`);
  await sleep(700); // past ARM_DELAY_MS (400ms, src/games/_arm-gate.ts)
  await session.evaluate(`
    const b = document.querySelector('#tb-start');
    if (b && !b.disabled) b.click();
    return true;
  `);
  await sleep(500);
  const vp = await assertViewport(session);
  const dlg = (await session.evaluate(DIALOG_CHECK)).value;
  const shotPath = path.join(OUT_DIR, `timebomb-1440x900.png`);
  await session.screenshot(shotPath);
  log['timebomb'] = {
    method: 'explicit #tb-begin then #tb-start past the 400ms arm window — same controls a player presses',
    viewport: vp,
    dialogs: dlg,
    shot: path.relative(repoRoot, shotPath),
  };
}

export default async function main(session) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const log = {};
  await captureDiceLoser(session, log);
  await captureTimebomb(session, log);
  for (const [id, cfg] of Object.entries(ROUTES)) {
    await captureGeneric(session, id, cfg, log);
  }
  return log;
}
