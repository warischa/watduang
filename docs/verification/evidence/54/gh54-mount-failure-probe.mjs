// gh#54 — does a failed game mount still wipe the group and strand the panel?
//
// Drives the REAL built site. The only thing changed is the served game chunk for two of the three
// pages, so the handler under test (src/pages/game/[id].astro's watduang:start listener), the real
// dynamic import, the real button, and the real saveGroup/root.hidden flow are all untouched:
//   pick-loser  — chunk untouched            → mount succeeds   (control / calibration)
//   short-stick — chunk throws on evaluation → `await load()` rejects
//   love-match  — chunk's default.mount throws → `game.mount()` throws
//
// Detector calibrated both ways in one run: #player-setup.hidden must be TRUE after a successful
// mount and FALSE after a failed one. A run where the control does not hide the panel is void.
const BASE = process.env.PROBE_BASE || 'http://localhost:4322';
const NAMES = ['สมชาย', 'ปูเป้', 'ก้อง'];

const READ = `
  const p = document.getElementById('player-setup');
  const s = document.getElementById('stage');
  return {
    panelHidden: p.hidden,
    stageKids: s ? s.children.length : -1,
    group: localStorage.getItem('watduang:group'),
    session: sessionStorage.getItem('watduang:session'),
  };
`;

export default async function run(session) {
  const out = {};
  for (const [id, expect] of [['pick-loser', 'mounts'], ['short-stick', 'load throws'], ['love-match', 'mount throws']]) {
    await session.nav(`${BASE}/game/${id}/`);
    await session.wipe();
    await session.evaluate(
      `localStorage.setItem('watduang:roster', JSON.stringify(${JSON.stringify(NAMES)})); return true;`,
    );
    await session.nav(`${BASE}/game/${id}/`); // reload so loadRoster() picks the seeded roster up

    const ticked = await session.evaluate(`
      const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
      boxes[0].click(); boxes[1].click();
      return { found: boxes.length, checked: boxes.filter((b) => b.checked).length };
    `);
    const before = await session.evaluate(READ);
    await session.evaluate(`document.getElementById('start-round').click(); return true;`);
    await new Promise((r) => setTimeout(r, 1800)); // the dynamic import is async
    const after = await session.evaluate(READ);

    out[id] = { expect, ticked: ticked.value, before: before.value, after: after.value };
  }
  out.consoleErrors = session.consoleErrors;
  return out;
}
