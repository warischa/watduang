// 320px overflow check across BOTH families of screen that render a reader's names: the six game
// pages, and the four /tool/ pages. The tool pages joined this probe for gh#109's last box — their
// name lists got fixed heights in 95140b2, which bounds vertical growth and says nothing about a
// long unbreakable token going sideways, and they seed from their OWN per-tool localStorage key
// (ADR-0039 took the tools off the shared roster), never 'watduang:roster'.
const BASE = process.env.BASE || 'http://localhost:4321';
const GAMES = ['pick-loser', 'timebomb', 'siamsi', 'short-stick', 'daily-fortune', 'love-match'];
const NAMES = ['ก้อง', 'ฟ้า', 'ตูน', 'แนน', 'บอส', 'มิ้น'];
// A 24-character spaceless Latin name is the worst case the roster allows. LONG_TOKEN is the
// calibration knob, not a setting: an 80-character token proves the detector can go RED, and
// BREAK_GUARD=1 strips the pages' own overflow-wrap so a run that comes back clean has been shown
// to be capable of coming back dirty. A probe that has never gone red has measured nothing.
const TOKEN = process.env.LONG_TOKEN || 'Wolfeschlegelsteinhausen';
const LONG = [TOKEN, 'ฟ้า'];
// The tool lists render one row per name, so give them enough rows that every row is checked and the
// token is not the only one — an off-token row is what tells a wrapping rule from a lucky short list.
const TOOL_LONG = [TOKEN, ...NAMES];
// A reveal picks at random, so the 7-name leg above left every RESULT box holding a short Thai name
// (measured: .wheel-result textLen 3, .draw-result-box 17, identical to the all-short leg) — the
// result boxes went unmeasured while the run looked complete. Two copies of the token is the leg that
// forces it: duplicates are kept on purpose (name-list.ts), 2 names satisfy the 2-team/2-label
// default, and every result box must then contain the token.
const TOOL_TOKEN_ONLY = [TOKEN, TOKEN];

// Each tool: its own storage key, the control a reader actually taps to produce the result, and the
// boxes 95140b2 pinned to a fixed height. `number` has no name list at all (it randomises a range),
// so it carries no key and is here only as the fourth page at 320px.
const TOOLS = [
  { id: 'wheel', key: 'watduang:tool:wheel-names', act: '#wheel-spin', settle: 2800,
    boxes: ['.wheel-names', '.wheel-result'] },
  { id: 'draw', key: 'watduang:tool:draw-names', act: '#draw-go', settle: 600,
    boxes: ['.draw-result-box', '.draw-names'] },
  { id: 'team', key: 'watduang:tool:team-names', act: '#team-split', settle: 600,
    boxes: ['.team-cards'] },
  { id: 'number', key: null, act: '#number-go', settle: 400, boxes: ['.number-result'] },
];

// Three questions in one pass, because a bounded box can hide the answer to the other two: does any
// element cross the viewport's right edge, does the document scroll sideways, and does a row escape
// its OWN box (a row wider than its scroller shows up as the box scrolling horizontally, or as the
// row's own scrollWidth exceeding its clientWidth) — that last one is invisible at document level.
const measure = (root, boxes) => `
  const doc = document.documentElement;
  const rootEl = document.querySelector(${JSON.stringify(root)});
  // An element whose rect crosses the viewport edge only counts if nothing above it clips — a wedge
  // inside the wheel's <svg> (overflow hidden/hidden, own right edge 304px at 320) reads as 321.3px
  // wide and cannot move the page by a pixel. Measured, not assumed: doc.scrollWidth stayed 320.
  // Overflow that IS clipped is not dropped, it is the boxes[] check's job one level down.
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.namespaceURI !== 'http://www.w3.org/1999/xhtml') return true;
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return true;
    }
    return false;
  };
  const over = [...rootEl.querySelectorAll('*')]
    .filter((el) => !clipped(el))
    .map((el) => ({ tag: el.tagName, cls: el.getAttribute('class'), right: +el.getBoundingClientRect().right.toFixed(1) }))
    .filter((e) => e.right > doc.clientWidth + 0.5);
  const boxes = ${JSON.stringify(boxes)}.map((sel) => {
    const box = document.querySelector(sel);
    if (!box) return { sel, missing: true };
    const inner = box.getBoundingClientRect().left + box.clientLeft + box.clientWidth;
    const rows = [...box.children];
    return {
      sel,
      rows: rows.length,
      // Liveness: a box measured before its content arrived reports 0 overflow and looks like a pass.
      // .wheel-result and .number-result hold a bare text node, so element children alone cannot tell
      // "rendered" from "empty" — the text length is what closes that gap for them.
      textLen: (box.textContent || '').trim().length,
      boxScrollX: +(box.scrollWidth - box.clientWidth).toFixed(1),
      // every row, not a sample: rowsOver crosses the box's content edge, rowsClipped is a row whose
      // own content is wider than the row itself, i.e. a token that refused to break.
      rowsOver: rows.filter((r) => r.getBoundingClientRect().right > inner + 0.5).length,
      rowsClipped: rows.filter((r) => r.scrollWidth - r.clientWidth > 0.5).length,
      widestRow: Math.max(0, ...rows.map((r) => +r.getBoundingClientRect().width.toFixed(1))),
    };
  });
  return {
    innerWidth: window.innerWidth,
    scrollX: +(doc.scrollWidth - doc.clientWidth).toFixed(1),
    overflowing: over.slice(0, 5),
    boxes,
  };`;

// The guard-stripping injection is shared by BOTH halves: it used to live only in the tools loop, so
// the games half of this probe had no positive control at all and a silently-inert games run reported
// bad:0. Runs after nav because nav drops the injected sheet.
// ponytail: measured ceiling -- with the guard stripped and the 72-char token, 2 of the 6 game screens
// go red (timebomb, short-stick: scrollX 405). The other 4 never paint the token wide enough to
// overflow, so their clean zero is un-calibrated; upgrade path is a per-game arm (inject the token into
// #stage) if a games regression ever slips through this leg.
const CONTROL = !!process.env.BREAK_GUARD;
const stripGuard = (session) =>
  session.evaluate(`
    const s = document.createElement('style');
    s.textContent = '* { overflow-wrap: normal !important; word-break: normal !important; }';
    document.head.appendChild(s);
    return true;`);

export default async function (session) {
  const out = [];
  for (const roster of [NAMES, LONG]) {
    for (const id of GAMES) {
      await session.setWidth(320, 844);
      await session.nav(`${BASE}/game/${id}/`);
      await session.wipe();
      await session.evaluate(
        `localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(roster))}); return true;`,
      );
      await session.nav(`${BASE}/game/${id}/`);
      if (CONTROL) await stripGuard(session);
      await session.evaluate(`
        const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
        for (const b of boxes) if (!b.checked) b.click();
        document.getElementById('start-round').click();
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline && document.getElementById('stage').children.length === 0) {
          await new Promise((r) => setTimeout(r, 50));
        }
        return document.getElementById('stage').children.length;`);
      // Advance one step where a tap reaches the result screen, so results are measured too.
      await session.evaluate(`
        const btn = document.querySelector('#stage button:not([disabled])');
        if (btn) btn.click();
        await new Promise((r) => setTimeout(r, 400));
        const b2 = document.querySelector('#stage button:not([disabled])');
        if (b2) b2.click();
        await new Promise((r) => setTimeout(r, 400));
        return true;`);
      const m = await session.evaluate(`
        const doc = document.documentElement;
        const over = [...document.querySelectorAll('#stage *')]
          .map((el) => ({ cls: el.className || el.tagName, right: el.getBoundingClientRect().right }))
          .filter((e) => e.right > doc.clientWidth + 0.5);
        return {
          innerWidth: window.innerWidth,
          scrollX: doc.scrollWidth - doc.clientWidth,
          stageChildren: document.getElementById('stage').children.length,
          overflowing: over.slice(0, 5),
        };`);
      out.push({ roster: roster === NAMES ? 'normal' : 'long-latin', id, ...m.value });
    }
  }
  const bad = out.filter((r) => r.scrollX > 0 || r.overflowing.length > 0 || r.stageChildren === 0);

  const tools = [];
  for (const roster of [NAMES, TOOL_LONG, TOOL_TOKEN_ONLY]) {
    for (const t of TOOLS) {
      await session.setWidth(320, 844);
      await session.nav(`${BASE}/tool/${t.id}/`);
      await session.wipe();
      if (t.key) {
        await session.evaluate(
          `localStorage.setItem(${JSON.stringify(t.key)}, ${JSON.stringify(JSON.stringify(roster))}); return localStorage.getItem(${JSON.stringify(t.key)}) !== null;`,
        );
      }
      await session.nav(`${BASE}/tool/${t.id}/`);
      if (CONTROL) await stripGuard(session);
      // Through the trigger, never past it: the CTA is what hands the names over, and its click is
      // what each tool page listens for.
      const handed = await session.evaluate(`
        const cta = document.getElementById('name-start');
        if (cta) cta.click();
        await new Promise((r) => setTimeout(r, 200));
        const act = document.querySelector(${JSON.stringify(t.act)});
        if (act && !act.disabled) act.click();
        await new Promise((r) => setTimeout(r, ${t.settle}));
        const stop = document.getElementById('wheel-stop');
        if (stop && !stop.hidden && !stop.disabled) { stop.click(); await new Promise((r) => setTimeout(r, 1200)); }
        return !!cta;`);
      const m = await session.evaluate(measure('main', t.boxes));
      tools.push({
        roster: roster === NAMES ? 'normal' : roster === TOOL_LONG ? 'long-latin' : 'token-only',
        id: t.id,
        seeded: handed.value,
        ...m.value,
      });
    }
  }
  const badTools = tools.filter(
    (r) =>
      r.innerWidth !== 320 ||
      r.scrollX > 0 ||
      r.overflowing.length > 0 ||
      r.boxes.some(
        (b) =>
          b.missing ||
          b.boxScrollX > 0 ||
          b.rowsOver > 0 ||
          b.rowsClipped > 0,
      ),
  );
  // Liveness, once per page and never per box: an EMPTY box reports zero overflow and reads exactly
  // like a pass, so a page where the CTA never fired must go red. Per-box was wrong — draw's
  // remaining list is legitimately empty once every name has been drawn, and `number` is handed no
  // names at all, so both flagged a real state as a defect.
  const dead = tools.filter(
    (r) => r.id !== 'number' && r.boxes.every((b) => b.rows === 0 && b.textLen === 0),
  );

  const result = {
    token: TOKEN,
    tokenLength: TOKEN.length,
    breakGuard: CONTROL,
    checked: out.length + tools.length,
    checkedGames: out.length,
    checkedTools: tools.length,
    // Per half, not one total: the control leg has to prove BOTH detectors can go red, and a single
    // `bad` count cannot tell 12 tool hits with an inert games half from real coverage.
    badGames: bad.length,
    badTools: badTools.length + dead.length,
    bad: bad.length + badTools.length + dead.length,
    badRows: [...bad, ...badTools, ...dead],
    games: out,
    tools,
  };
  // Throwing is the point on a NORMAL run: driver.mjs propagates a non-zero exit on a throw, so an
  // overflow is a red run and not a line of JSON someone has to read. On the CONTROL run it is the
  // opposite -- the run must reach here and report what it found, because "exited non-zero" is also
  // what a watchdog kill, a Chrome death and a page that never loaded look like. The control's
  // verdict is the JSON below (see ci-probes-verdict.mjs), so an unexercised detector cannot pass.
  if (result.bad > 0 && !CONTROL) {
    throw new Error(`320px overflow on ${result.bad} screen(s): ${JSON.stringify(result.badRows)}`);
  }
  return result;
}
