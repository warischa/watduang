// gh#181 evidence run: clean-screen 1440x900 readings for dice-loser and timebomb.
// Measurement only. Reaches the round/game screen through #dl-begin / #tb-begin — the SAME
// controls a player presses — never through the reset button, which is what produced the
// dialog-contaminated prior readings this run replaces.
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4173';
const VP = { w: 1440, h: 900 };
const LOADS = Number(process.env.LOADS || 6);

const ROUTES = [
  {
    id: 'dice-loser',
    url: `${BASE}/game/dice-loser/play/`,
    beginSel: '#dl-begin',
    dialogSel: '#dl-reset-dialog',
    screenSel: '#dl-play',
    boardSel: '#dl-play', // the board IS the screen on this route (181/README: "same element the board column measures")
    rootSel: '#app',
  },
  {
    id: 'timebomb',
    url: `${BASE}/game/timebomb/play/`,
    beginSel: '#tb-begin',
    dialogSel: '#tb-reset-dialog',
    screenSel: '#tb-stage',
    boardSel: '.tb-canvas', // the play surface per 181/README's board column, distinct from #tb-stage
    rootSel: '#app',
    // #tb-begin only reaches a pass-the-device interstitial (#tb-start, disabled for ARM_DELAY_MS =
    // 400ms — src/games/_arm-gate.ts — a shared reveal-arm window, not a bug). The bomb canvas stays
    // `hidden` until #tb-start is pressed, so measuring `.tb-canvas` needs this second, player-real
    // control too, waited past its own arm window before clicking it, same as a real hand would.
    secondStepSel: '#tb-start',
    secondStepWaitMs: 700,
  },
];

// Shell-level modals mounted on every play route (src/shell/PlayerSetup.astro, LeaveConfirm.astro) —
// checked in addition to the route's own reset dialog, so "no other modal" is a real read, not an
// assumption that the reset dialog is the only one that could be open.
const SHELL_DIALOG_SELS = ['#clear-choice', '#leave-confirm'];

const READ = (r) => `
  const root = document.querySelector(${JSON.stringify(r.rootSel)});
  const dialog = document.querySelector(${JSON.stringify(r.dialogSel)});
  const screen = document.querySelector(${JSON.stringify(r.screenSel)});
  const board = document.querySelector(${JSON.stringify(r.boardSel)});
  const begin = document.querySelector(${JSON.stringify(r.beginSel)});
  const visible = (e) => {
    if (!e) return false;
    const rect = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return rect.width > 0 && rect.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const rootRect = root ? root.getBoundingClientRect() : null;
  const screenRect = screen ? screen.getBoundingClientRect() : null;
  const boardRect = board ? board.getBoundingClientRect() : null;
  // Every <dialog> in the document, native open state — not just this route's own reset dialog.
  const allDialogs = [...document.querySelectorAll('dialog')];
  const allDialogIds = allDialogs.map((d) => d.id || '(no id)');
  const openDialogIds = allDialogs.filter((d) => d.open).map((d) => d.id || '(no id)');
  // Any ARIA-modal-flagged element too, in case a route uses a non-<dialog> overlay pattern.
  const ariaModalsVisible = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')]
    .filter(visible).map((e) => e.id || e.className || '(unlabelled)');
  const shellDialogsOpen = ${JSON.stringify(SHELL_DIALOG_SELS)}
    .map((sel) => document.querySelector(sel))
    .filter((d) => d && d.open).map((d) => d.id);
  return {
    innerWidth,
    innerHeight,
    dialogOpen: dialog ? dialog.open : null,
    dialogPresentInDOM: !!dialog,
    allDialogIds,               // every <dialog> id actually present in this document at this moment
    openDialogIds,              // expect [] — every <dialog> in the doc, not just this route's own
    ariaModalsVisible,          // expect [] — catches a non-<dialog> modal pattern
    shellDialogsOpen,           // expect [] — checked against #clear-choice/#leave-confirm IF present;
                                 // see allDialogIds for whether either actually mounted on this route
    screenPresent: !!screen,
    screenVisible: visible(screen),
    screenHidden: screen ? screen.hasAttribute('hidden') : null,
    screenWidth: screenRect ? screenRect.width : null,
    screenHeight: screenRect ? screenRect.height : null,
    boardWidth: boardRect ? boardRect.width : null,
    boardHeight: boardRect ? boardRect.height : null,
    boardLeft: boardRect ? boardRect.left : null,
    boardRightMargin: boardRect ? (innerWidth - boardRect.right) : null,
    rootWidth: rootRect ? rootRect.width : null,
    rootHeight: rootRect ? rootRect.height : null,
    beginStillVisible: visible(begin),
  };
`;

export default async function main(session) {
  const results = {};
  for (const r of ROUTES) {
    const loads = [];
    for (let i = 0; i < LOADS; i++) {
      await session.nav(r.url);
      await session.wipe();
      await session.nav(r.url); // fresh setup screen on top of cleared storage
      await session.setWidth(VP.w, VP.h);
      const vpCheck = await session.evaluate('return { innerWidth, innerHeight };');
      // click begin through the same control a player presses
      const clickRes = await session.evaluate(`
        const b = document.querySelector(${JSON.stringify(r.beginSel)});
        if (!b) return { clicked: false, why: 'no begin button' };
        b.click();
        return { clicked: true };
      `);
      await new Promise((res) => setTimeout(res, 300));
      let secondStepRes = null;
      if (r.secondStepSel) {
        await new Promise((res) => setTimeout(res, r.secondStepWaitMs));
        secondStepRes = (await session.evaluate(`
          const b = document.querySelector(${JSON.stringify(r.secondStepSel)});
          if (!b) return { clicked: false, why: 'no second-step button' };
          if (b.disabled) return { clicked: false, why: 'still disabled past its own arm window' };
          b.click();
          return { clicked: true };
        `)).value;
        await new Promise((res) => setTimeout(res, 300));
      }
      const read = await session.evaluate(READ(r));
      loads.push({ load: i + 1, vpCheck: vpCheck.value, clickRes: clickRes.value, secondStepRes, read: read.value });
    }
    results[r.id] = loads;
  }
  return results;
}
