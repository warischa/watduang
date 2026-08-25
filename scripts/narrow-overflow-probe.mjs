// Cross-game 320px overflow check. Five new screens landed at once and the one defect already found
// was a width defect, so measure the whole set rather than the one that was reported.
const BASE = process.env.BASE || 'http://localhost:4321';
const GAMES = ['pick-loser', 'timebomb', 'siamsi', 'short-stick', 'daily-fortune', 'love-match'];
const NAMES = ['ก้อง', 'ฟ้า', 'ตูน', 'แนน', 'บอส', 'มิ้น'];
// A 24-character spaceless Latin name is the worst case the roster allows.
const LONG = ['Wolfeschlegelsteinhausen', 'ฟ้า'];

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
  return { checked: out.length, bad: bad.length, badRows: bad, all: out };
}
