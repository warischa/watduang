// gh#61 — real-touch proof that the collapse window in src/shell/PlayerSetup.astro stops a ghost tap
// from navigating off a tool page, and that this probe can go RED. Same instrument and same physical
// claim as scripts/arm-gate-probe.mjs, one layer out: session.tap() (Input.dispatchTouchEvent) drives
// Chrome's real touch-to-synthetic-click pipeline, so a "did not navigate" here is a guard that fired,
// not an element that happened to sit somewhere.
//
// The hazard, concretely: on /tool/team/ the setup panel collapses inside the #start-round click
// handler, GameNav rises by the panel's own height, and a live <a href="/game/..."> lands where the CTA
// was. Contact 1 is the legitimate tap that starts the round. Contact 2, arriving under ARM_DELAY_MS
// later, must not navigate.
//
// This is NOT the 75-point grid probe from the box-holding fix, and must not be replaced by one: under
// this shape the geometry legitimately DOES collide — the link really is under the finger — so a grid
// probe goes red while the fix works. The invariant is behavioural: location must not change.
//
// Contact 2's coordinate is measured, never assumed. After contact 1 the probe scans the CTA's own
// pre-collapse box with elementFromPoint for the point that actually resolves to an anchor, and taps
// THAT. A same-pixel guess would miss the link and produce a false "suppressed" verdict — the
// positive-control failure arm-gate-probe.mjs hit on timebomb.
//
// Run (built dist/ served, headless Chrome on CDP_PORT — see scripts/driver.mjs's header):
//   PROBE_BASE=http://localhost:4321 CDP_PORT=9222 node scripts/driver.mjs <this file>
// PROBE_BASE selects WHICH build is under test: the fixed dist, or the positive-control dist built from
// the same tree with the swallower branch deleted (one variable).

const ARM_DELAY_MS = 400; // mirrors src/games/_arm-gate.ts, which the panel imports
const GAP_MS = Number(process.env.PROBE_GAP_MS || 120); // ghost contact, well inside the window
const ROSTER = ['เอ', 'บี', 'ซี', 'ดี'];
const TOOL_PATH = process.env.PROBE_TOOL || '/tool/team/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ev(session, body) {
  const r = await session.evaluate(body);
  if (r.error) throw new Error(`evaluate failed: ${r.error}`);
  return r.value;
}

async function seed(session, base, path) {
  await session.nav(`${base}${path}`);
  await session.setWidth(320, 568);
  await session.wipe(); // on-origin, never on about:blank
  await ev(session, `localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(ROSTER))}); return true;`);
  await session.nav(`${base}${path}`);
  const state = await ev(
    session,
    `
    const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
    for (const b of boxes) if (!b.checked) b.click();
    const cta = document.getElementById('start-round');
    const r = cta.getBoundingClientRect();
    return { innerWidth, roster: JSON.parse(localStorage.getItem('watduang:roster') || '[]').length,
             ticked: boxes.length,
             // trap #2: this detector must be FALSE here, before anything starts
             roundStartedDetector: !document.querySelector('#start-round')?.offsetParent,
             cta: { left: r.left, top: r.top, right: r.right, bottom: r.bottom,
                    cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 } };
  `,
  );
  return state;
}

// The point inside `box` that resolves to an <a href> right now, nearest to (cx, cy). Returns null when
// nothing in that box is a link — which is itself a finding, not a pass.
const FIND_LINK_POINT = (box, cx, cy) => `
  const box = ${JSON.stringify(box)};
  let best = null;
  for (let y = Math.ceil(box.top); y <= Math.floor(box.bottom); y += 2) {
    for (let x = Math.ceil(box.left); x <= Math.floor(box.right); x += 2) {
      const el = document.elementFromPoint(x, y);
      const a = el && el.closest ? el.closest('a[href]') : null;
      if (!a) continue;
      const d = (x - ${cx}) ** 2 + (y - ${cy}) ** 2;
      if (!best || d < best.d) best = { x, y, d, href: a.getAttribute('href'), text: a.textContent.trim().slice(0, 24) };
    }
  }
  return best;
`;

export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:4321';
  const out = { base, toolPath: TOOL_PATH, gapMs: GAP_MS, armDelayMs: ARM_DELAY_MS, at: new Date().toISOString() };

  // ---- 1 + 2: the double tap. Contact 1 starts the round; contact 2 lands on whatever rose into its box.
  out.seed = await seed(session, base, TOOL_PATH);

  const p1 = session.tap(out.seed.cta.cx, out.seed.cta.cy); // dispatches synchronously, before its own await
  await sleep(40); // the collapse is synchronous with the click; let layout settle, stay well inside the window
  out.afterContact1 = await ev(
    session,
    `
    const panel = document.getElementById('player-setup');
    const cs = getComputedStyle(panel);
    return { panelHidden: panel.hidden, display: cs.display, visibility: cs.visibility,
             offsetParentNull: panel.offsetParent === null,
             panelRectHeight: panel.getBoundingClientRect().height,
             // trap #2's signal, on a tool page, AFTER the round started: must now be TRUE
             roundStartedDetector: !document.querySelector('#start-round')?.offsetParent,
             href: location.pathname };
  `,
  );
  out.contact2 = await ev(session, FIND_LINK_POINT(out.seed.cta, out.seed.cta.cx, out.seed.cta.cy));

  if (!out.contact2) {
    out.verdict = 'NO_LINK_UNDER_CONTACT2';
    await p1;
    return out;
  }
  const elapsed = 40;
  await sleep(Math.max(0, GAP_MS - elapsed));
  const p2 = session.tap(out.contact2.x, out.contact2.y);
  await Promise.all([p1, p2]);
  out.afterContact2 = await ev(session, `return { href: location.pathname, title: document.title };`);
  out.navigated = out.afterContact2.href !== TOOL_PATH;

  // ---- 3: the window is not permanent. Wait past ARM_DELAY_MS with no contact, tap the same link.
  if (!out.navigated) {
    await sleep(ARM_DELAY_MS * 2);
    out.postWindowPoint = await ev(session, FIND_LINK_POINT(out.seed.cta, out.seed.cta.cx, out.seed.cta.cy));
    const target = out.postWindowPoint || out.contact2;
    await session.tap(target.x, target.y);
    await sleep(900);
    out.afterPostWindowTap = await ev(session, `return { href: location.pathname, title: document.title };`);
    out.postWindowNavigated = out.afterPostWindowTap.href !== TOOL_PATH;
  }

  out.verdict = out.navigated
    ? 'NAVIGATED (ghost tap stole the round)'
    : out.postWindowNavigated
      ? 'SUPPRESSED_THEN_RELEASED'
      : 'SUPPRESSED_BUT_STUCK (the window never released — a guard that swallows forever)';
  out.consoleErrors = session.consoleErrors;
  return out;
}
