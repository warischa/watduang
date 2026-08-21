// Outcome check for gh#54, not the mechanism: after a mount that throws, can the player still play?
// Measures the panel the way a finger meets it — client rects and elementFromPoint on #start-round —
// and whether the names they ticked are still ticked. Run against both roots (4322 fixed, 4323 unfixed).
const BASE = process.env.PROBE_BASE || 'http://localhost:4322';
const NAMES = ['สมชาย', 'ปูเป้', 'ก้อง'];

export default async function run(session) {
  const out = {};
  for (const id of ['short-stick', 'love-match']) {
    await session.nav(`${BASE}/game/${id}/`);
    await session.wipe();
    await session.evaluate(
      `localStorage.setItem('watduang:roster', JSON.stringify(${JSON.stringify(NAMES)})); return true;`,
    );
    await session.nav(`${BASE}/game/${id}/`);
    await session.evaluate(`
      const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
      boxes[0].click(); boxes[1].click();
      return true;
    `);
    await session.evaluate(`document.getElementById('start-round').click(); return true;`);
    await new Promise((r) => setTimeout(r, 1800));
    const res = await session.evaluate(`
      const start = document.getElementById('start-round');
      const r = start.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        startRects: start.getClientRects().length,
        startHitByAPoint: at ? at.id : null,
        stillTicked: [...document.querySelectorAll('#roster-list input[type=checkbox]')].filter((b) => b.checked).length,
        group: localStorage.getItem('watduang:group'),
        onlyControlIsClearGroup: !document.getElementById('clear-group').hidden && start.getClientRects().length === 0,
      };
    `);
    out[id] = res.value ?? res;
  }
  return out;
}
