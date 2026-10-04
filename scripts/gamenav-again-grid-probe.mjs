// Does a double-tap on a tap-transition still land on a GameNav link, and when it does, does the
// leave-confirm hold? Hand-run, wired into no gate; scripts/stable-exit-markers-check.mjs is the
// static tripwire standing in for it (ADR-0018).
//
// The hazard (ADR-0013's foot, gh#39): GameNav renders BELOW #stage on every GameLayout page, so a
// transition that shrinks the stage slides its links up into the coordinate the finger just used, and
// the second tap of a double-tap opens another page. ADR-0015 accepted that geometry permanently
// ("nothing moves; only the consequence changes") and answered it with the leave-confirm instead.
// gh#43 filed this file as closed evidence for that reason, and that still holds: a collision never
// fails this probe. What it grades is the consequence — whether a real tap on the colliding link
// leaves the page.
//
// What changed under this file (retargeted 2026-10-04): gh#149 deleted every party landing, so the
// only GameLayout pages left are the solo fortune landings (ADR-0040, players [1, 1]). They mount on
// load, render no PlayerSetup and no #start-round, and take no roster, so the old ROSTER_JSON /
// GAME_ID / #start-round path threw on its first click. The page set is now read off the served
// sitemap (every /game/<id>/ path that is not a play route), and every landing must have a walk below
// or the run FAILs. The control that collides is no longer an "again" button: on the build this was
// retargeted against, siamsi's #ss-keep (slip -> done, the stage shrinks to about 107px) put live
// GameNav anchors under the finger with the control scrolled to the bottom of a 320x900 viewport in
// 10 of 12 walks to that screen, and in none with it centred. The slip is drawn at random and its
// height decides whether the done screen lands under the finger, so a run can come back NO-SUBJECT
// on a clean build — rerun it; per-run numbers are in the evidence directory below. #ss-again grows
// the stage and collided nowhere. So every
// stage-replacing tap of each walk is scanned, and the filename is kept only so the ADR-0013 and
// ADR-0014 repro lines still resolve.
//
// Method, per landing x viewport x scroll alignment: walk the real game; before each tap, scroll the
// control to the alignment and grid-sample its whole box (4px step, every point inset 2px — the
// box-edge trap in docs/agents/browser-verification.md); fire the control; 400ms later resolve every
// sampled point with elementFromPoint. On the first point that resolves to an a[href] inside
// nav.game-next, drive a REAL touch there (session.tap — ADR-0015: .click() plus elementFromPoint
// proves where a link is, never that navigation happens), read the path and #leave-confirm, then
// touch the same point again (the anti-recursion check), then close through #leave-stay and walk on.
//
// Verdict (driver.mjs exits 0 whatever this returns — read `verdict`):
//   PASS        at least one collision was found on a page that had announced a round, and every
//               such collision's real tap kept the path and opened #leave-confirm, third tap included
//   FAIL        a walk could not be driven (a control missing or disabled, a tap that changed nothing,
//               no sampled point inside the viewport), a landing with no walk or a walk with no
//               landing, a landing with no GameNav link to detect, or a guarded tap that left the page
//   UNGUARDED   a collision on a page that had announced no round. ADR-0015's guard is absent there by
//               design (a page with no round has nothing to lose), so this is not a guard failure — but
//               it IS the hazard this file exists to find, and whether it matters is an owner question,
//               so it never reads as a pass
//   NO-SUBJECT  no collision on any announced-round page, so the guard was never exercised: a run that
//               found nothing to test, never a green
// "Announced a round" is read at runtime: a listener installed before the page's own script counts
// the same document event the shell's leave-confirm latches on (src/games/_round-start.ts), so a game
// that stops announcing surfaces here as UNGUARDED instead of being excused by a page-id list.
//
// ponytail: COVERAGE CEILING. Two viewports and three alignments are a sample of where a finger can
// be, not an enumeration — ADR-0016: the collision set is owned by Thai text length x layout engine,
// so no scan converges, and a zero here is a claim about these 18 walks only. siamsi draws its slip
// at random, so the slip height (and with it the hit count) varies run to run; the tie-away branch of
// the slip screen is not walked (it renders the same end state as keep). love-match answers one
// fixed pair. One real tap per colliding transition, at the first hit point, not one per point.
//
// Calibrated 2026-10-04 against the built artifact, not a stub — the outputs and the mutation commands
// live in docs/verification/evidence/gamenav-grid-2026-10-04/.
//
// Run: PROBE_BASE=http://localhost:4321 node scripts/driver.mjs scripts/gamenav-again-grid-probe.mjs
// (needs `npx serve dist/ -l 4321` and headless Chrome on CDP_PORT — see scripts/driver.mjs's header;
// give a concurrent run its own pair of ports, docs/runbook.md)

// Each step is one tap that replaces #stage. `prep` runs in-page before the first step and taps
// nothing that replaces the stage (love-match's two answers toggle in place). A step's second field
// marks a press-and-hold and names the control its release renders: the hold feeds a charge, so the
// probe holds until that control exists rather than for a fixed time.
const WALKS = {
  siamsi: { steps: [['ss-intent-done'], ['ss-hold', 'ss-open-slip'], ['ss-open-slip'], ['ss-keep'], ['ss-again']] },
  'love-match': {
    prep: `for (const id of ['lm-me-f', 'lm-band-0']) { const b = await ready(id); if (!b) return false; b.click(); } return true;`,
    steps: [['lm-go'], ['lm-again']],
  },
  'daily-fortune': { steps: [['df-go'], ['df-again']] },
};
const VIEWPORTS = [[320, 900], [375, 667]];
const ALIGNS = ['start', 'center', 'end'];
const GRID = 4;
const ROUND_EVENT = 'watduang:round-started';

const HELPERS = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // _arm-gate disables a freshly rendered button for 400ms; a click inside that window is a silent
  // no-op, so wait it out, and report a control that never arms rather than clicking it anyway.
  const ready = async (id) => {
    const e = document.getElementById(id);
    for (let i = 0; i < 40 && e && e.disabled; i++) await sleep(60);
    return e && !e.disabled ? e : null;
  };`;

const stepBody = (id, holdUntil, align) => `${HELPERS}
  const el = await ready('${id}');
  if (!el) return { id: '${id}', missing: true };
  el.scrollIntoView({ block: '${align}' });
  await sleep(150);
  const r = el.getBoundingClientRect();
  const pts = [];
  for (let x = r.left + 2; x <= r.right - 2; x += ${GRID})
    for (let y = r.top + 2; y <= r.bottom - 2; y += ${GRID})
      if (x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight) pts.push([x, y]);
  const stage = document.getElementById('stage');
  const stageBefore = stage.getBoundingClientRect().height;
  const html = stage.innerHTML;
  // Node identity as well as markup: df-again redraws at random and can land on the very same
  // lines, so identical markup after a real re-render read as "nothing changed" once.
  const before = [...stage.children];
  if ('${holdUntil}') {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const until = Date.now() + 5000;
    while (Date.now() < until && !document.getElementById('${holdUntil}')) await sleep(60);
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  } else el.click();
  await sleep(400);
  const hits = [];
  for (const [x, y] of pts) {
    const at = document.elementFromPoint(x, y);
    const a = at && at.closest ? at.closest('a[href]') : null;
    if (a && a.closest('nav.game-next')) hits.push({ x: Math.round(x), y: Math.round(y), href: a.getAttribute('href') });
  }
  return {
    id: '${id}', rect: [r.left, r.top, r.right, r.bottom].map(Math.round), sampled: pts.length,
    changed: stage.innerHTML !== html || before.some((n) => !n.isConnected),
    stageHeightPx: [Math.round(stageBefore), Math.round(stage.getBoundingClientRect().height)],
    roundAnnounced: (window.__probeRounds || 0) > 0,
    navHits: hits.length, hrefsHit: [...new Set(hits.map((h) => h.href))], firstHit: hits[0] || null,
  };`;

const readGuard = `
  const dlg = document.getElementById('leave-confirm');
  const go = document.getElementById('leave-go');
  const r = go && dlg && dlg.open ? go.getBoundingClientRect() : null;
  return { path: location.pathname, dialogOpen: dlg ? dlg.open : null,
           leaveGoRect: r ? [r.left, r.top, r.right, r.bottom] : null };`;

export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:4321';
  const failures = [];
  const runs = [];

  const xml = await (await fetch(`${base}/sitemap-0.xml`)).text();
  const landings = [...xml.matchAll(/<loc>[^<]*?(\/game\/([^/<]+)\/)<\/loc>/g)].map((m) => m[2]);
  for (const id of landings) if (!WALKS[id]) failures.push(`landing /game/${id}/ has no walk -- unscanned, not clean`);
  for (const id of Object.keys(WALKS)) if (!landings.includes(id)) failures.push(`walk '${id}' has no built landing -- stale walk`);

  await session.onNewDocument(
    `window.__probeRounds = 0; document.addEventListener('${ROUND_EVENT}', () => { window.__probeRounds++; }, true);`,
  );

  for (const id of landings.filter((l) => WALKS[l])) {
    for (const [w, h] of VIEWPORTS) {
      for (const align of ALIGNS) {
        const run = { page: id, viewport: `${w}x${h}`, align, steps: [] };
        runs.push(run);
        // Origin first, then wipe, then reload: a wipe on about:blank clears nothing.
        await session.nav(`${base}/game/${id}/`);
        await session.setWidth(w, h);
        await session.wipe();
        await session.nav(`${base}/game/${id}/`);
        await new Promise((r) => setTimeout(r, 900)); // the solo branch awaits a dynamic import before mount()
        const env = await session.evaluate(
          `return { innerWidth, navLinks: document.querySelectorAll('nav.game-next a[href]').length };`,
        );
        run.innerWidth = env.value?.innerWidth;
        if (env.value?.innerWidth !== w) { failures.push(`${id} ${w}x${h}: innerWidth ${env.value?.innerWidth} -- did not reflow, run void`); continue; }
        if (!(env.value?.navLinks > 0)) { failures.push(`${id}: no a[href] inside nav.game-next -- the detector has nothing to find`); continue; }
        if (WALKS[id].prep) {
          const p = await session.evaluate(`${HELPERS}\n${WALKS[id].prep}`);
          if (p.value !== true) { failures.push(`${id} ${run.viewport} ${align}: prep failed (${p.error ?? p.value})`); continue; }
        }
        for (const [stepId, holdUntil] of WALKS[id].steps) {
          const s = await session.evaluate(stepBody(stepId, holdUntil || '', align));
          const step = s.value ?? { id: stepId, error: s.error };
          run.steps.push(step);
          const where = `${id} ${run.viewport} ${align} #${stepId}`;
          if (step.error || step.missing) { failures.push(`${where}: control missing or never armed${step.error ? ` (${step.error})` : ''}`); break; }
          if (!step.changed) { failures.push(`${where}: the tap changed nothing in #stage -- the walk measured one screen twice`); break; }
          if (!(step.sampled > 0)) { failures.push(`${where}: no sampled point inside the viewport -- nothing was tested`); break; }
          if (!step.firstHit) continue;

          const { x, y } = step.firstHit;
          await session.tap(x, y);
          const second = (await session.evaluate(readGuard)).value ?? {};
          await session.tap(x, y);
          const third = (await session.evaluate(readGuard)).value ?? {};
          const g = second.leaveGoRect;
          step.doubleTap = {
            tapAt: [x, y], pathAfterSecondTap: second.path, dialogOpen: second.dialogOpen,
            pathAfterThirdTap: third.path,
            // point-to-rect distance, computed here so the number returned is the number read
            leaveGoClearancePx: g ? Math.round(Math.hypot(Math.max(g[0] - x, 0, x - g[2]), Math.max(g[1] - y, 0, y - g[3]))) : null,
          };
          const stayed = second.path === `/game/${id}/` && third.path === `/game/${id}/`;
          if (!step.roundAnnounced) {
            step.unguarded = true;
            if (!stayed) break; // left the page by design; nothing further on this walk to scan
          } else if (!stayed || second.dialogOpen !== true) {
            failures.push(`${where}: guarded collision at (${x}, ${y}) -- path ${second.path} then ${third.path}, dialog ${second.dialogOpen}`);
            break;
          }
          await session.evaluate(`document.getElementById('leave-stay')?.click(); return true;`);
        }
      }
    }
  }

  const all = runs.flatMap((r) => r.steps.map((s) => ({ ...s, page: r.page, viewport: r.viewport, align: r.align })));
  const guarded = all.filter((s) => s.doubleTap && s.roundAnnounced);
  const unguarded = all.filter((s) => s.unguarded);
  const verdict = failures.length ? 'FAIL' : unguarded.length ? 'UNGUARDED' : guarded.length ? 'PASS' : 'NO-SUBJECT';
  return {
    verdict,
    failures,
    landings,
    guardedCollisions: guarded.map((s) => `${s.page} ${s.viewport} ${s.align} #${s.id}: ${s.navHits}/${s.sampled} points on ${s.hrefsHit.join(' ')}; real tap at (${s.doubleTap.tapAt}) -> ${s.doubleTap.pathAfterSecondTap}, dialog ${s.doubleTap.dialogOpen}, third tap -> ${s.doubleTap.pathAfterThirdTap}, leave-go ${s.doubleTap.leaveGoClearancePx}px away`),
    unguardedCollisions: unguarded.map((s) => `${s.page} ${s.viewport} ${s.align} #${s.id}: ${s.navHits}/${s.sampled} points on ${s.hrefsHit.join(' ')}; no round announced, real tap -> ${s.doubleTap.pathAfterSecondTap}`),
    stepsScanned: all.length,
    runs,
    consoleErrors: session.consoleErrors,
  };
}
