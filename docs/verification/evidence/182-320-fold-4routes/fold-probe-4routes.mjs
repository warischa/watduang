// gh#182 evidence run: primary-control fold position at 320x568 for the four routes with no prior
// measurement — pinocchio-luck, short-stick, how-close-is-near, zero-trigger. Measurement only, no
// layout change, no verdict. Method matches docs/verification/evidence/182-320-fold/fold-probe.mjs
// (n loads, typical/worst, calibration, positive clean-screen check) but drives each route through
// its OWN named controls rather than a generic largest-button heuristic — these four routes' setup
// screens (steppers, multi-screen wizards) are not safe for that heuristic, and roster-bridge.ts
// already documents each route's own exact control ids.
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4173';
const VP = { w: 320, h: 568 };
const LOADS = Number(process.env.LOADS || 6);
const NAMES = ['QQAAX', 'QQBBY', 'QQCCZ'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ARM_WAIT = 700; // past ARM_DELAY_MS=400 (src/games/_arm-gate.ts), same margin used last milestone

const ROOT_SEL = '#app, #app-container, #appRoot';

// Shell-level modals every play route can mount as page chrome, checked the same way as the
// gh#181 clean-screen run: by id, in addition to the generic <dialog>/[aria-modal] sweep.
const SHELL_DIALOG_SELS = ['#clear-choice', '#leave-confirm'];

const HELPERS = `
  const ROOT_SEL = ${JSON.stringify(ROOT_SEL)};
  const visible = (e) => {
    if (!e) return false;
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const clip = (top, bottom, lo, hi) => Math.max(0, Math.min(bottom, hi) - Math.max(top, lo));
  // Walk up from an element to the nearest ancestor that actually scrolls its own overflow — computed,
  // not assumed, since each route names this container differently (main#mainContent, #screen-game...).
  const scrollAncestor = (el) => {
    for (let e = el?.parentElement; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 1) return e;
      if (e === document.body) break;
    }
    return null;
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
  return { ok: true, sig, len: sig.length };
`;

const SEED = `
  localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(NAMES))});
  localStorage.setItem('watduang:group', ${JSON.stringify(JSON.stringify(NAMES))});
  return true;
`;

// One measurement: primary control's fold position + its scroll container + a positive clean-screen
// check (every <dialog> in the doc, named — not just "selector came back null").
const MEASURE = (primarySel, screenSel, firstItemSel) => `
  ${HELPERS}
  const primary = document.querySelector(${JSON.stringify(primarySel)});
  const screen = document.querySelector(${JSON.stringify(screenSel)});
  if (!primary) return { ok: false, why: 'primary selector not found: ${primarySel}' };
  ${firstItemSel ? `
  const firstItem = document.querySelector(${JSON.stringify(firstItemSel)});
  const fiRect = firstItem ? firstItem.getBoundingClientRect() : null;
  const firstItemReading = fiRect ? { sel: ${JSON.stringify(firstItemSel)}, top: fiRect.top,
    topPastFold: fiRect.top - innerHeight, visiblePx: clip(fiRect.top, fiRect.bottom, 0, innerHeight) } : null;
  ` : 'const firstItemReading = null;'}
  const pRect = primary.getBoundingClientRect();
  const container = scrollAncestor(primary);
  const cRect = container ? container.getBoundingClientRect() : null;
  const foldEdge = cRect ? cRect.top + container.clientHeight : null;
  // Fallback when no nested overflow:auto ancestor exists: does the WHOLE PAGE scroll instead?
  // document.scrollingElement is the element the browser actually scrolls for the document (html or
  // body depending on quirks/standards mode) — checked regardless of its computed overflow-y, since
  // the default (visible) is scrollable at the window level unless a route explicitly locks it.
  const se = document.scrollingElement;
  const pageScrollable = se ? se.scrollHeight > se.clientHeight + 1 : false;
  const pageScrollInfo = se ? { tag: se.tagName.toLowerCase(), overflowY: getComputedStyle(se).overflowY,
    clientHeight: se.clientHeight, scrollHeight: se.scrollHeight, pageScrollable } : null;
  const allDialogs = [...document.querySelectorAll('dialog')];
  const allDialogIds = allDialogs.map((d) => d.id || '(no id)');
  const openDialogIds = allDialogs.filter((d) => d.open).map((d) => d.id || '(no id)');
  const ariaModalsVisible = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')]
    .filter(visible).map((e) => e.id || e.className || '(unlabelled)');
  const shellDialogsOpen = ${JSON.stringify(SHELL_DIALOG_SELS)}
    .map((sel) => document.querySelector(sel)).filter((d) => d && d.open).map((d) => d.id);
  const root = document.querySelector(ROOT_SEL);
  const boxes = [...root.querySelectorAll('*')].filter(visible).map((e) => {
    const r = e.getBoundingClientRect();
    const id = e.id ? '#' + e.id : '';
    const cls = e.classList.length ? '.' + [...e.classList].join('.') : '';
    return { sel: e.tagName.toLowerCase() + id + cls, top: r.top, bottom: r.bottom, height: r.height,
             children: e.children.length };
  }).sort((a, b) => b.height - a.height).slice(0, 8);
  return {
    ok: true, innerWidth, innerHeight,
    primarySel: ${JSON.stringify(primarySel)},
    primaryTop: pRect.top, primaryBottom: pRect.bottom, primaryHeight: pRect.height,
    topPastFold: pRect.top - innerHeight,
    visiblePx: clip(pRect.top, pRect.bottom, 0, innerHeight),
    container: container ? (container.tagName.toLowerCase() + (container.id ? '#' + container.id : '')) : null,
    containerOverflowY: container ? getComputedStyle(container).overflowY : null,
    containerClientHeight: container ? container.clientHeight : null,
    containerScrollHeight: container ? container.scrollHeight : null,
    foldEdge,
    pageScrollInfo,
    screenPresent: !!screen, screenVisible: visible(screen), screenHidden: screen ? screen.hasAttribute('hidden') : null,
    allDialogIds, openDialogIds, ariaModalsVisible, shellDialogsOpen,
    tallestBoxes: boxes,
    firstItemReading,
  };
`;

// Calibration: force the reported largest block to 2000px, confirm the primary control's top moves,
// then release and confirm it returns — same instrument-proving step as 182-320-fold.
const CALIBRATE = (blockSel, primarySel) => `
  const b = document.querySelector(${JSON.stringify(blockSel)});
  const p = document.querySelector(${JSON.stringify(primarySel)});
  if (!b || !p) return { error: 'calibration selectors missing' };
  const read = () => ({ blockHeight: b.getBoundingClientRect().height, primaryTop: p.getBoundingClientRect().top });
  const before = read();
  b.style.setProperty('min-height', '2000px', 'important');
  const forced = read();
  b.style.removeProperty('min-height');
  const after = read();
  return { before, forced, after, moved: forced.primaryTop - before.primaryTop,
           returned: after.primaryTop === before.primaryTop && after.blockHeight === before.blockHeight };
`;

async function freshLoad(session, url) {
  await session.nav(url);
  await session.setWidth(VP.w, VP.h);
  await session.wipe(); // on-origin, per docs/agents/browser-verification.md trap 4
  await session.evaluate(SEED); // roster-bridge.ts reads these keys on the NEXT nav's DOMContentLoaded
  await session.nav(url);
  await session.setWidth(VP.w, VP.h);
  await sleep(1200);
}

async function clickWhenArmed(session, sel) {
  await sleep(ARM_WAIT);
  return (await session.evaluate(`
    const b = document.querySelector(${JSON.stringify(sel)});
    if (!b) return { clicked: false, why: 'not found: ${sel}' };
    if (b.disabled) return { clicked: false, why: 'still disabled past arm window: ${sel}' };
    b.click();
    return { clicked: true };
  `)).value;
}

// Per-route path: ordered list of steps. `clickSel: null` means already on this screen (first step).
// `report: true` marks a step whose primary control is one of the candidates this run measures.
const ROUTE_PATHS = {
  'zero-trigger': [
    { clickSel: null, primarySel: '#btn-big-action', screenSel: '#screen-game', report: true,
      label: '#btn-big-action', why: 'the single round-action button on #screen-game; no pass/ready gate exists on this route (checked main.js: no interstitial screen between setup and #screen-game), so it is the only candidate.' },
  ],
  'short-stick': [
    { clickSel: null, primarySel: '#stick-grid', screenSel: '#view-draw', report: true,
      firstItemSel: '.straw-btn:not([disabled])',
      label: '#stick-grid (region containing every .straw-btn pick target)',
      why: 'sticks are picked via N equivalent buttons (main.js creates one .straw-btn per stick, each aria-labelled "choose stick N"); no single stick is more primary than another, so the region holding all of them is measured, not one arbitrarily-picked stick. The first unused .straw-btn is also recorded for a concrete single-element reading.' },
  ],
  'pinocchio-luck': [
    { clickSel: null, primarySel: '#ready', screenSel: '#stageFrame', report: true, name: 'ready-gate',
      label: '#ready ("พร้อมแล้ว" — pass-the-device gate, shown every turn via renderPass())',
      why: 'directly analogous to freeze-tap\'s own designated primary (button#playerReadyBtn): a recurring per-turn "start your turn" gate the incoming player presses before anything is revealed. Matches this repo\'s only established precedent for what counts as primary on this shape of screen.' },
    { clickSel: '#ready', primarySel: '.answer', screenSel: '#stageFrame', report: true, name: 'answer-choice',
      label: '.answer (first of 3 answer buttons A/B/C on the question screen, renderQuestion())',
      why: 'the actual gameplay decision for the turn — reading the question and picking an answer — which is arguably MORE "primary" than the pass gate in the sense that it is the one action that changes the round outcome. Reported as a second candidate because the case for either is real; this run does not pick one.' },
  ],
  'how-close-is-near': [
    { clickSel: null, primarySel: '#btnStartGame', screenSel: '#screenContainer', report: false, name: 'transit-1',
      label: null, why: null },
    { clickSel: '#btnStartGame', primarySel: '#btnAckSecrecy', screenSel: '#screenContainer', report: false, name: 'transit-2',
      label: null, why: null },
    { clickSel: '#btnAckSecrecy', primarySel: '#btnReadyForTurn', screenSel: '#screenContainer', report: true, name: 'ready-for-turn-gate',
      label: '#btnReadyForTurn ("พร้อม..." — per-turn pass/ready gate, GameState.TURN_INTRO)',
      why: 'same shape as pinocchio-luck\'s #ready and freeze-tap\'s #playerReadyBtn: the recurring per-turn gate the incoming player presses before their own screen is revealed. Reported by the same precedent-based reasoning.' },
    { clickSel: '#btnReadyForTurn', primarySel: '#btnSubmitNumber', screenSel: '#screenContainer', report: true, name: 'submit-number',
      label: '#btnSubmitNumber ("ล็อกคำตอบนี้ 🔒" — commits the picked number, GameState.NUMBER_ENTRY)',
      why: 'the actual gameplay decision for the turn, same reasoning as pinocchio-luck\'s .answer buttons: arguably the more consequential control since it is what turns a pick into a locked answer. Reported as a second candidate, not chosen over the gate.' },
  ],
};

// The largest visible block on the whole screen, independent of which candidate is being measured —
// reused across every step at a given load since "largest block" is a screen-level reading.
async function measureOne(session, routeId, step) {
  const m = await session.evaluate(MEASURE(step.primarySel, step.screenSel, step.firstItemSel));
  return m.value ?? { ok: false, why: m.error };
}

export default async function main(session) {
  const out = {};
  for (const [routeId, path] of Object.entries(ROUTE_PATHS)) {
    const url = `${BASE}/game/${routeId}/play/`;
    const loads = [];
    for (let i = 1; i <= LOADS; i++) {
      await freshLoad(session, url);
      const vp = await session.evaluate('return { innerWidth, innerHeight };');
      const load = { load: i, vp: vp.value, steps: [] };
      for (const step of path) {
        let clickRes = null;
        if (step.clickSel) clickRes = await clickWhenArmed(session, step.clickSel);
        else await sleep(ARM_WAIT); // still let the freshly-revealed screen's own arm window pass
        const measured = await measureOne(session, routeId, step);
        load.steps.push({ name: step.name || 'primary', report: step.report, label: step.label, why: step.why, clickRes, measured });
      }
      loads.push(load);
    }

    // Calibration: for each REPORTED step, on one fresh load, force that load's own tallest visible
    // box to 2000px and confirm the primary control's top moves, then release and confirm it returns
    // to the load-1 baseline — proves the instrument reads a real layout, not a cached number.
    const calibrations = [];
    for (let si = 0; si < path.length; si++) {
      const step = path[si];
      if (!step.report) continue;
      const blockSel = loads[0].steps[si].measured?.tallestBoxes?.[0]?.sel;
      if (!blockSel) { calibrations.push({ step: step.name, error: 'no tallest box recorded on load 1' }); continue; }
      await freshLoad(session, url);
      await sleep(ARM_WAIT);
      for (let i = 0; i <= si; i++) {
        const s = path[i];
        if (s.clickSel) await clickWhenArmed(session, s.clickSel);
        else await sleep(ARM_WAIT);
      }
      const cal = await session.evaluate(CALIBRATE(blockSel, step.primarySel));
      calibrations.push({ step: step.name, blockSel, result: cal.value ?? { error: cal.error } });
    }

    out[routeId] = { loads, calibrations };
  }
  return out;
}
