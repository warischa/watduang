// gh#39 follow-up — the three assertions the original six-step verify never made. Each one is written
// against a state the author of the leave-confirm guard was not thinking about, and each was confirmed
// RED on the shipped code before the fix landed:
//
//   A. CLOSED-DIALOG INERTNESS, on all 6 pages that render #leave-confirm — the game pages, since
//      gh#106 moved the dialog out of PlayerSetup and into GameLayout (it was "6 games + 3 tools" when
//      this probe was written, on the false premise that tool pages mount it too; see NOT_SCANNED).
//      A closed <dialog> must have zero client rects and must not answer
//      elementFromPoint anywhere. tokens.css set `display: flex` on #leave-confirm unconditionally,
//      which beats the UA's `dialog:not([open]) { display: none }` — so the closed dialog painted a
//      178px panel with two live buttons on every one of those pages, and #leave-go there is an
//      unguarded navigation button.
//      Detector calibrated BOTH ways in one pass: the same grid scan runs while the dialog is
//      genuinely open (showModal) and must find the buttons, then again after close() and must not.
//      A run whose positive control finds nothing is void, not a pass.
//
//   B. POST-DISMISS INERTNESS, on the 3 party game pages (ROUND_PAGES — the guard only arms where a
//      round starts on the page; see NOT_ARMED). Open the guard with a REAL tap on a GameNav link,
//      dismiss it with the safe branch, then tap (i) the same coordinate, (ii) where #leave-go sat
//      while open, (iii) where #leave-go sits now. location.pathname must survive all three.
//      Then the pendingHref check, which has no direct observable: re-open the dialog from the probe
//      (a path that never assigns pendingHref) and tap #leave-go. If pendingHref still held the link
//      from the dismissed question, that tap navigates. Unchanged pathname is the proof it was cleared.
//
//   C. CLEARANCE AT THE CLASS BOUNDARY. The at-top/at-bottom split is `tapY >= innerHeight / 2`, so
//      the adversarial tap is at the boundary itself, not at whatever y a walk happened to produce.
//      A GameNav anchor is scrolled to the middle of the viewport and tapped at y = 449 and y = 450 —
//      one on each side of the split — and the point-to-rect clearance to #leave-go is measured for
//      both. Real anchoring keeps both large; UA-centred anchoring collapses them.
//
//   D. MODIFIED CLICKS PASS THROUGH, on the same 3 ROUND_PAGES as B/C. cmd/ctrl/shift/middle on a sibling game is
//      the round-PRESERVING gesture — it opens a second tab. The guard intercepted it and then
//      answered with location.href, turning it into the round-killing one. Calibrated in the same
//      pass: the plain click on the same link must still be intercepted, or the guard was simply off.
//
// Run: node scripts/driver.mjs scripts/leave-confirm-probe.mjs
// (needs `npx serve dist/ -l 4321` and headless Chrome on CDP_PORT — see scripts/driver.mjs's header)
// STATUS (gh#43): a static tripwire now stands in for this in CI — scripts/leave-confirm-check.mjs. This probe stays manual; run it when the dialog's CSS or the guard changes.

// Same roster the other #39 probes seed: long stacked-tone-mark Thai names are the tallest, widest
// chip row the product can produce, so every screen below them sits as low as it ever will.
const PLAYERS = [
  'สมชายใจดีมากพี่น้อง',
  'ปู่ย่าตายาย',
  'ก้องภพสุดหล่อ',
  'น้ำหวานคนสวย',
  'บีม',
  'เจี๊ยบ',
  'ต้นกล้าแห่งทุ่งนา',
  'แพรวพราวสาวน้อย',
];

// Assertion A's set: every page that RENDERS #leave-confirm. Since gh#106 that is GameLayout's job,
// unconditionally, so all 6 game pages carry the dialog — including the three ADR-0040 solo ones
// (verified against the build: `grep -c 'id="leave-confirm"' dist/game/*/index.html` is 1 on all six).
const DIALOG_PAGES = ['timebomb', 'siamsi', 'pick-loser', 'short-stick', 'daily-fortune', 'love-match'];

// /tool/draw|team|wheel/ used to be scanned here on the assumption that they mount the same dialog.
// They never did: the tools render ToolNameEntry, not PlayerSetup, and since gh#106 the dialog comes
// from GameLayout, which tool pages do not use — "Tool pages stay unguarded by not rendering this
// component at all — ADR-0015's own reason, 'there is no round to lose there'". Scanning them produced
// three ERROR rows on a null #leave-confirm (docs/verification/probe-triage-2026-08-26.md), i.e. an
// assertion about a dialog that was never built. Dropped, not fixed: there is nothing there to assert.
const NOT_SCANNED = {
  '/tool/draw/': 'renders no #leave-confirm by design (GameLayout mounts the guard; tool pages are not games — ADR-0015)',
  '/tool/team/': 'renders no #leave-confirm by design (same)',
  '/tool/wheel/': 'renders no #leave-confirm by design (same)',
  '/tool/number/': 'renders no #leave-confirm and no name entry at all',
};

// Assertions B/C/D need an ARMED guard, which needs a round started ON this page. ponytail: the 3
// party pages only, and the reason is the guard's own predicate rather than a shortcut —
// LeaveConfirm.astro latches on #player-setup going hidden (party) or on ROUND_STARTED_EVENT (solo).
const ROUND_PAGES = ['timebomb', 'pick-loser', 'short-stick'];
const NOT_ARMED = {
  'daily-fortune': 'startsRound: false — LeaveConfirm.astro never arms here ("daily-fortune and the current love-match never start one"), so there is no armed guard for B/C/D to measure. Assertion A above still covers the page.',
  'love-match': 'startsRound: false — same. Assertion A above still covers the page.',
  siamsi: 'startsRound: true on a [1, 1] page — the guard DOES arm here, via ROUND_STARTED_EVENT, but reaching that state needs the solo idle screen its own redesign ticket is about to replace. UNCOVERED gap, not a by-design N/A: B/C/D are unmeasured on this page.',
};

// rectOf reports getClientRects().length alongside the box: a display:none element still answers
// getBoundingClientRect() with all-zero, but an element that is merely empty does too, and only the
// rect COUNT tells "generates no boxes" apart from "generates a zero-sized one".
const HELPERS = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right),
             bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height),
             clientRects: el.getClientRects().length, display: getComputedStyle(el).display,
             position: getComputedStyle(el).position };
  };
  function scanBox(b) {
    const pts = [];
    for (let x = b.left + 1; x <= b.right - 1; x += 6)
      for (let y = b.top + 1; y <= b.bottom - 1; y += 5) pts.push([x, y]);
    let dialogHits = 0, buttonHits = 0;
    const sample = [];
    for (const [x, y] of pts) {
      const at = document.elementFromPoint(x, y);
      if (!at || !at.closest) continue;
      if (at.closest('#leave-confirm')) dialogHits++;
      if (at.id === 'leave-stay' || at.id === 'leave-go') {
        buttonHits++;
        if (sample.length < 3) sample.push({ x: Math.round(x), y: Math.round(y), id: at.id });
      }
    }
    return { points: pts.length, dialogHits, buttonHits, sample };
  }
  const dlg = document.getElementById('leave-confirm');
  const stay = document.getElementById('leave-stay');
  const go = document.getElementById('leave-go');
`;

// Assertion A, one page at a time. Everything here runs inside a single evaluate so the open/close
// pair cannot be split across a navigation.
const CLOSED_DIALOG = `
  ${HELPERS}
  const beforeOpen = { openAttr: dlg.open, dialog: rectOf(dlg), stay: rectOf(stay), go: rectOf(go) };
  // Only scannable if the closed dialog painted a box at all — post-fix there is nothing to scan,
  // which is itself the pass condition, so noBox is recorded rather than silently counted as 0 hits.
  const closedOwnBoxHits = beforeOpen.dialog.width > 0 && beforeOpen.dialog.height > 0
    ? scanBox(beforeOpen.dialog)
    : { points: 0, dialogHits: 0, buttonHits: 0, sample: [], noBox: true };
  dlg.showModal();
  await sleep(120);
  const openBox = rectOf(dlg);
  const positiveControl = scanBox(openBox);
  dlg.close();
  await sleep(120);
  const afterClose = { openAttr: dlg.open, dialog: rectOf(dlg), stay: rectOf(stay), go: rectOf(go) };
  const formerBoxHits = scanBox(openBox);
  return { beforeOpen, closedOwnBoxHits, openBox, positiveControl, afterClose, formerBoxHits };
`;

const noBoxes = (r) => r.dialog.clientRects === 0 && r.stay.clientRects === 0 && r.go.clientRects === 0;

// Point-to-rect distance, 0 when the point is inside. Computed in node, not in the page, so the
// number this file reports is the number that was measured.
const clearance = (pt, rect) =>
  rect
    ? Math.round(
        Math.hypot(
          Math.max(rect.left - pt.x, 0, pt.x - rect.right),
          Math.max(rect.top - pt.y, 0, pt.y - rect.bottom),
        ),
      )
    : null;

async function startRound(session, base, id) {
  // Origin first, then wipe, then reload: a wipe issued on about:blank clears nothing
  // (browser-verification.md trap 4).
  await session.nav(`${base}/game/${id}/`);
  await session.setWidth(320, 900);
  await session.wipe();
  await session.evaluate(
    `localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(PLAYERS))}); return true;`,
  );
  await session.nav(`${base}/game/${id}/`);
  const before = await session.evaluate(`
    return { innerWidth: window.innerWidth, innerHeight: window.innerHeight,
             setupPanelVisible: !!document.querySelector('#start-round')?.offsetParent };`);
  await session.evaluate(`
    const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
    for (const b of boxes) if (!b.checked) b.click();
    document.getElementById('start-round').click(); return true;`);
  await new Promise((r) => setTimeout(r, 900)); // [id].astro awaits a dynamic import before mount()
  // Detector calibration (browser-verification.md trap 2): the panel must be visible before the start
  // and hidden after it. root.hidden is the exact bit the leave guard reads, so a walk where it never
  // flipped is measuring a page with no guard armed at all.
  const after = await session.evaluate(`
    return { setupPanelVisible: !!document.querySelector('#start-round')?.offsetParent,
             innerWidth: window.innerWidth, innerHeight: window.innerHeight,
             pathname: location.pathname };`);
  return {
    roundLive:
      before.value?.setupPanelVisible === true &&
      after.value?.setupPanelVisible === false &&
      after.value?.innerWidth === 320,
    before: before.value,
    after: after.value,
  };
}

// Scrolls a GameNav sibling link as close to the middle of the viewport as the document allows and
// reports whether it got there. It usually cannot: GameNav sits near the document end with only the
// footer below it, so scrollIntoView clamps at max scroll and the link stops K px above the viewport
// bottom, where K is a constant of the page (footer height + the link's own half height), not of the
// viewport. idealHeight solves for the one viewport height where max scroll puts the link exactly on
// the split — H/2 = H - K, i.e. H = 2K — which is how the boundary tap becomes measurable at all.
const CENTRE_A_NAV_LINK = `
  const a = document.querySelector('nav.game-next a[href^="/game/"]');
  if (!a) return { missing: true };
  a.scrollIntoView({ block: 'center' });
  await new Promise((r) => setTimeout(r, 250));
  const r = a.getBoundingClientRect();
  const de = document.documentElement;
  return { href: a.getAttribute('href'),
           rect: { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right),
                   bottom: Math.round(r.bottom) },
           boundaryY: window.innerHeight / 2, innerHeight: window.innerHeight,
           coversBoundary: r.top < window.innerHeight / 2 && r.bottom > window.innerHeight / 2,
           idealHeight: Math.round(2 * (window.innerHeight - (r.top + r.height / 2))),
           atMaxScroll: Math.abs(window.scrollY - (de.scrollHeight - window.innerHeight)) < 2 };
`;

const READ_GUARD = `
  const d = document.getElementById('leave-confirm');
  const g = document.getElementById('leave-go');
  const s = document.getElementById('leave-stay');
  const box = (el) => { const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right),
             bottom: Math.round(r.bottom), clientRects: el.getClientRects().length }; };
  return { pathname: location.pathname, open: d.open, dialog: box(d), go: box(g), stay: box(s),
           msg: document.getElementById('leave-confirm-msg').textContent.trim() };
`;

export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:4321';

  // ---- A: closed-dialog inertness on all 9 PlayerSetup pages -------------------------------------
  const closedDialog = {};
  const urls = DIALOG_PAGES.map((id) => `/game/${id}/`);
  for (const url of urls) {
    await session.nav(`${base}${url}`);
    await session.setWidth(320, 900);
    await session.nav(`${base}${url}`); // re-load at the emulated size so the layout is the real one
    // Positive control (BREAK_GUARD=1): re-plant the exact defect this assertion was written against —
    // tokens.css set `display: flex` on #leave-confirm unconditionally, beating the UA's
    // `dialog:not([open]) { display: none }`, so the CLOSED dialog painted a 178px panel with two live
    // buttons. Assertion A must go FAIL on every page under it. Without this leg, "no stray buttons
    // found" is indistinguishable from "nothing was scanned" — the false-green shape this whole round
    // of work exists to remove. It plants a defect; it never disables the detector.
    if (process.env.BREAK_GUARD) {
      await session.evaluate(`
        const s = document.createElement('style');
        s.setAttribute('data-probe-control', '');
        s.textContent = '#leave-confirm { display: flex !important; }';
        document.head.appendChild(s);
        return true;`);
    }
    const r = await session.evaluate(CLOSED_DIALOG);
    const v = r.value;
    closedDialog[url] = v
      ? {
          detectorCalibrated: v.positiveControl.buttonHits > 0,
          closedRectsBeforeOpen: v.beforeOpen.dialog.clientRects,
          closedDisplay: v.beforeOpen.dialog.display,
          closedBox: v.beforeOpen.dialog,
          buttonHitsWhileClosed: v.closedOwnBoxHits.buttonHits,
          buttonHitsWhileOpen: v.positiveControl.buttonHits,
          buttonHitsInFormerBoxAfterClose: v.formerBoxHits.buttonHits,
          strayButtonSamples: [...v.closedOwnBoxHits.sample, ...v.formerBoxHits.sample].slice(0, 3),
          verdict:
            v.positiveControl.buttonHits === 0
              ? 'VOID (positive control found no buttons while open)'
              : noBoxes(v.beforeOpen) &&
                  noBoxes(v.afterClose) &&
                  v.closedOwnBoxHits.buttonHits === 0 &&
                  v.formerBoxHits.buttonHits === 0
                ? 'PASS'
                : 'FAIL',
        }
      : { error: r.error };
  }

  // ---- B + C: post-dismiss inertness and boundary clearance, on every game page -------------------
  const perGame = {};
  for (const id of ROUND_PAGES) {
    const started = await startRound(session, base, id);
    if (!started.roundLive) {
      perGame[id] = { roundLive: false, started, verdictB: 'VOID', verdictC: 'VOID' };
      continue;
    }
    // C runs at 320x568, not the 900 the rest of the walk uses. At 900 the page is shorter than two
    // viewports mid-round, so max scroll leaves the nearest non-exempt link at y=601 and the boundary
    // row (450) has nothing tappable on it — measured, not assumed. 568 is a real device height and
    // the document does scroll past it, so the split at y=284 lands on a real GameNav link.
    await session.setWidth(320, 568);
    let nav = await session.evaluate(CENTRE_A_NAV_LINK);
    if (nav.value && !nav.value.missing && !nav.value.coversBoundary) {
      // Retry at the solved height rather than at a guessed one, then assert coversBoundary instead of
      // assuming it: a tap that misses the link measures nothing and must read VOID, not PASS.
      const h = nav.value.idealHeight;
      if (h >= 300 && h <= 900) {
        await session.setWidth(320, h);
        nav = await session.evaluate(CENTRE_A_NAV_LINK);
      }
    }
    if (!nav.value || nav.value.missing) {
      perGame[id] = { roundLive: true, navLink: nav.value ?? nav.error, verdictB: 'VOID', verdictC: 'VOID' };
      continue;
    }
    const { rect, boundaryY } = nav.value;
    const cx = Math.round((rect.left + rect.right) / 2);

    // ---- C: one tap on each side of the at-top/at-bottom split ----------------------------------
    const boundary = [];
    for (const y of [boundaryY - 1, boundaryY]) {
      const ty = Math.round(y);
      // The link must actually cover the boundary row, or this measures a tap on nothing.
      const onLink = ty > rect.top && ty < rect.bottom;
      if (!onLink) { boundary.push({ tapY: ty, onLink: false }); continue; }
      await session.tap(cx, ty);
      const g = await session.evaluate(READ_GUARD);
      const rects = g.value ?? null;
      boundary.push({
        tapY: ty,
        onLink: true,
        side: ty < boundaryY ? 'at-bottom (tap in top half)' : 'at-top (tap in bottom half)',
        dialogOpen: rects?.open ?? null,
        pathname: rects?.pathname ?? g.error,
        dialogBox: rects?.dialog ?? null,
        leaveGoBox: rects?.go ?? null,
        leaveGoClearancePx: clearance({ x: cx, y: ty }, rects?.go ?? null),
        dialogClearancePx: clearance({ x: cx, y: ty }, rects?.dialog ?? null),
      });
      await session.evaluate(`document.getElementById('leave-confirm').close(); return true;`);
    }

    // ---- B: open with a real tap, dismiss with the safe branch, then re-tap everything -----------
    // Back to 900 so B's coordinates are comparable with the recorded #39 evidence, which was taken
    // at that height. Re-read the link's box: the height change reflowed the page under it.
    await session.setWidth(320, 900);
    const navAt900 = await session.evaluate(CENTRE_A_NAV_LINK);
    const rect900 = navAt900.value?.rect ?? rect;
    const triggerX = Math.round((rect900.left + rect900.right) / 2);
    const triggerY = Math.round((rect900.top + rect900.bottom) / 2);
    await session.tap(triggerX, triggerY);
    const opened = await session.evaluate(READ_GUARD);
    const goWhileOpen = opened.value?.go ?? null;
    const stayWhileOpen = opened.value?.stay ?? null;

    let dismissed = null, retapTrigger = null, retapFormerGo = null, retapClosedGo = null, ghostGo = null;
    if (opened.value?.open && stayWhileOpen) {
      await session.tap(
        Math.round((stayWhileOpen.left + stayWhileOpen.right) / 2),
        Math.round((stayWhileOpen.top + stayWhileOpen.bottom) / 2),
      );
      dismissed = (await session.evaluate(READ_GUARD)).value ?? null;

      // (i) the coordinate that opened the guard. Re-opening it is correct; navigating is not.
      await session.tap(triggerX, triggerY);
      retapTrigger = (await session.evaluate(READ_GUARD)).value ?? null;
      await session.evaluate(`document.getElementById('leave-confirm').close(); return true;`);

      // (ii) where #leave-go sat while the dialog was open.
      await session.tap(
        Math.round((goWhileOpen.left + goWhileOpen.right) / 2),
        Math.round((goWhileOpen.top + goWhileOpen.bottom) / 2),
      );
      retapFormerGo = (await session.evaluate(READ_GUARD)).value ?? null;
      await session.evaluate(`document.getElementById('leave-confirm').close(); return true;`);

      // (iii) where #leave-go sits NOW. Post-fix it has no box, so there is nothing to tap; pre-fix
      // this is the stray button that navigates with no confirm at all.
      const nowGo = (await session.evaluate(READ_GUARD)).value?.go ?? null;
      if (nowGo && nowGo.clientRects > 0) {
        await session.tap(
          Math.round((nowGo.left + nowGo.right) / 2),
          Math.round((nowGo.top + nowGo.bottom) / 2),
        );
        retapClosedGo = (await session.evaluate(READ_GUARD)).value ?? null;
        await session.evaluate(`document.getElementById('leave-confirm').close(); return true;`);
      } else {
        retapClosedGo = { skipped: 'closed #leave-go generates no box', pathname: dismissed?.pathname };
      }

      // pendingHref: re-open from the probe (never assigns pendingHref) and press #leave-go for real.
      // A stale pendingHref navigates here; a cleared one cannot.
      await session.evaluate(`document.getElementById('leave-confirm').showModal(); return true;`);
      const reopened = (await session.evaluate(READ_GUARD)).value ?? null;
      if (reopened?.go) {
        await session.tap(
          Math.round((reopened.go.left + reopened.go.right) / 2),
          Math.round((reopened.go.top + reopened.go.bottom) / 2),
        );
        ghostGo = (await session.evaluate(READ_GUARD)).value ?? null;
      }
      await session.evaluate(`document.getElementById('leave-confirm').close(); return true;`);
    }

    // ---- F6: a modified or non-primary click must reach the browser untouched ---------------------
    // cmd/ctrl/middle on a sibling game opens a SECOND tab and leaves this round alone — the
    // round-preserving action. Intercepting it and then honouring the go branch with location.href
    // navigates the current tab instead, converting the safe gesture into the destructive one.
    // Dispatched rather than tapped because CDP touch cannot carry modifier keys; the guard reads
    // e.metaKey/e.button and never isTrusted, so a synthetic MouseEvent exercises the same branch.
    // A bubble-phase blocker records defaultPrevented and then stops the real navigation — it runs
    // AFTER the capture-phase guard, so it cannot mask what the guard did.
    const modifierClicks = {};
    for (const [name, init] of [
      ['plain', { button: 0 }],
      ['metaKey', { metaKey: true, button: 0 }],
      ['ctrlKey', { ctrlKey: true, button: 0 }],
      ['shiftKey', { shiftKey: true, button: 0 }],
      ['middle', { button: 1 }],
    ]) {
      const r = await session.evaluate(`
        const link = document.querySelector('nav.game-next a[href^="/game/"]');
        const dlg = document.getElementById('leave-confirm');
        let seen = null;
        const blocker = (e) => { seen = { defaultPrevented: e.defaultPrevented }; e.preventDefault(); };
        document.addEventListener('click', blocker, false);
        link.dispatchEvent(new MouseEvent('click', Object.assign(
          { bubbles: true, cancelable: true }, ${JSON.stringify(init)})));
        document.removeEventListener('click', blocker, false);
        const out = { guardIntercepted: seen ? seen.defaultPrevented : null, dialogOpen: dlg.open,
                      pathname: location.pathname };
        if (dlg.open) dlg.close();
        return out;`);
      modifierClicks[name] = r.value ?? { error: r.error };
    }
    // Calibrated both ways in one pass: the plain click MUST be intercepted, or this is measuring a
    // guard that is simply off and every "not intercepted" below would be meaningless.
    const modifierClicksVerdict =
      modifierClicks.plain?.guardIntercepted !== true
        ? 'VOID (plain click was not intercepted — guard not armed)'
        : ['metaKey', 'ctrlKey', 'shiftKey', 'middle'].every(
              (k) => modifierClicks[k]?.guardIntercepted === false && modifierClicks[k]?.dialogOpen === false,
            )
          ? 'PASS'
          : 'FAIL';

    // Where each class actually places the box at 900 — the viewport the F2 report measured, so these
    // numbers are directly comparable to the 369-547 / 353-531 it recorded (both mid-screen, i.e. the
    // class changed nothing but flex order). Driven by setting the class directly rather than by a tap:
    // at 900 no non-exempt link can reach y=450 at all, and this asks a pure CSS-placement question.
    // The end-to-end proof that a real finger gets this placement is boundaryClearance above.
    const anchoring = {};
    for (const cls of ['at-bottom', 'at-top']) {
      const r = await session.evaluate(`
        const d = document.getElementById('leave-confirm');
        d.classList.remove('at-top', 'at-bottom');
        d.classList.add('${cls}');
        d.showModal();
        await new Promise((res) => setTimeout(res, 120));
        const b = (el) => { const q = el.getBoundingClientRect();
          return { top: Math.round(q.top), bottom: Math.round(q.bottom) }; };
        const out = { innerHeight: window.innerHeight, dialog: b(d),
                      go: b(document.getElementById('leave-go')) };
        d.close();
        d.classList.remove('at-top', 'at-bottom');
        return out;`);
      const v = r.value;
      const tap = { x: 160, y: v ? v.innerHeight / 2 : 450 };
      anchoring[cls] = v
        ? {
            innerHeight: v.innerHeight,
            dialogSpan: [v.dialog.top, v.dialog.bottom],
            leaveGoSpan: [v.go.top, v.go.bottom],
            // The property the class claims: the whole box sits in the half the finger is NOT in.
            entirelyInOppositeHalf:
              cls === 'at-bottom' ? v.dialog.top >= v.innerHeight / 2 : v.dialog.bottom <= v.innerHeight / 2,
            clearanceFromBoundaryTapPx: clearance(tap, {
              left: 0, right: 320, top: v.go.top, bottom: v.go.bottom,
            }),
          }
        : { error: r.error };
    }

    const home = `/game/${id}/`;
    const stayedPut = (r) => r?.pathname === home;
    perGame[id] = {
      roundLive: true,
      navLink: nav.value.href,
      navLinkRect: rect,
      boundaryY,
      viewportHeightForC: nav.value.innerHeight,
      viewportHeightForB: navAt900.value?.innerHeight ?? null,
      message: opened.value?.msg ?? null,
      boundaryClearance: boundary,
      anchoringAt900: anchoring,
      modifierClicks,
      verdictD: modifierClicksVerdict,
      postDismiss: {
        guardOpenedByRealTap: opened.value?.open ?? null,
        goWhileOpen,
        dismissedDialogOpen: dismissed?.open ?? null,
        dismissedGoClientRects: dismissed?.go?.clientRects ?? null,
        retapTrigger: { pathname: retapTrigger?.pathname ?? null, dialogOpen: retapTrigger?.open ?? null },
        retapFormerGo: { pathname: retapFormerGo?.pathname ?? null },
        retapClosedGo,
        pendingHrefCleared: ghostGo ? ghostGo.pathname === home : null,
        ghostGoPathname: ghostGo?.pathname ?? null,
      },
      verdictB:
        opened.value?.open === true &&
        dismissed?.open === false &&
        stayedPut(retapTrigger) &&
        stayedPut(retapFormerGo) &&
        (retapClosedGo?.skipped ? dismissed?.go?.clientRects === 0 : stayedPut(retapClosedGo)) &&
        ghostGo?.pathname === home
          ? 'PASS'
          : 'FAIL',
      verdictC: boundary.every((b) => b.onLink && b.dialogOpen === true) ? 'MEASURED' : 'VOID',
    };
  }

  const closedVerdicts = Object.fromEntries(
    Object.entries(closedDialog).map(([k, v]) => [k, v.verdict ?? 'ERROR']),
  );
  return {
    summary: {
      pagesScanned: urls.length,
      // Judged by a CI predicate, not by the exit code: the control leg is satisfied only when
      // breakGuard is true AND every page reported a stray button, and the clean leg only when every
      // page's own two-way calibration (detectorCalibrated) found the buttons while open.
      breakGuard: !!process.env.BREAK_GUARD,
      assertionA_pagesWithCalibratedDetector: Object.values(closedDialog).filter((v) => v.detectorCalibrated).length,
      assertionA_pagesWithStrayButtons: Object.values(closedDialog).filter(
        (v) => v.buttonHitsWhileClosed > 0 || v.buttonHitsInFormerBoxAfterClose > 0,
      ).length,
      assertionBCD_pagesMeasured: ROUND_PAGES,
      assertionBCD_pagesNotMeasured: NOT_ARMED,
      pagesWithNoDialogByDesign: NOT_SCANNED,
      assertionA_closedDialogInert: closedVerdicts,
      assertionB_postDismissInert: Object.fromEntries(
        Object.entries(perGame).map(([k, v]) => [k, v.verdictB]),
      ),
      assertionD_modifiedClicksPassThrough: Object.fromEntries(
        Object.entries(perGame).map(([k, v]) => [k, v.verdictD ?? 'VOID']),
      ),
      assertionC_anchoringAt900: Object.fromEntries(
        Object.entries(perGame).map(([k, v]) => [k, v.anchoringAt900 ?? null]),
      ),
      assertionC_boundaryClearancePx: Object.fromEntries(
        Object.entries(perGame).map(([k, v]) => [
          k,
          (v.boundaryClearance ?? []).map((b) => ({
            tapY: b.tapY,
            side: b.side ?? null,
            leaveGoClearancePx: b.leaveGoClearancePx ?? null,
            dialogClearancePx: b.dialogClearancePx ?? null,
          })),
        ]),
      ),
    },
    closedDialog,
    perGame,
    consoleErrors: session.consoleErrors,
  };
}
