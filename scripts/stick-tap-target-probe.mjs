// gh#149 STALE TARGET — this file drives /game/<id>/ landing pages that ADR-0050 ruling 2 deleted.
// It is a manual tool wired into no gate, so it cannot red anything; run it and it navigates to a
// URL that only Azure resolves, via a 301 to the play route, and measures the wrong page. Re-point
// it at /game/<id>/play/ (a different DOM) or delete it — do not read a run of it as evidence.
// gh#79 AC probe: every stick must be a tap target of at least 44px on its SMALLEST edge, at every
// roster size the game accepts (players: [2, 10]) and at the narrowest width the site supports.
// Arithmetic cannot settle this — the page has no body-margin reset, the panel wraps, and the row
// heights come from align-content: stretch. Measure the real boxes.
const BASE = process.env.BASE || 'http://localhost:4321';
const WIDTHS = [320, 390];
const SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const NAMES = ['ก้อง', 'ฟ้า', 'ตูน', 'แนน', 'บอส', 'มิ้น', 'เจ', 'ปอ', 'หมิว', 'ต้น'];

export default async function (session) {
  const rows = [];
  for (const w of WIDTHS) {
    await session.setWidth(w, 844);
    for (const n of SIZES) {
      const players = NAMES.slice(0, n);
      await session.nav(`${BASE}/game/short-stick/`);
      await session.wipe();
      await session.evaluate(
        `localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(players))}); return true;`,
      );
      await session.nav(`${BASE}/game/short-stick/`);
      const started = await session.evaluate(`
        const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
        for (const b of boxes) if (!b.checked) b.click();
        const btn = document.getElementById('start-round');
        btn.click();
        return { boxes: boxes.length, innerWidth: window.innerWidth };`);
      // The game module is lazy-imported, so the stage is empty for a beat after start-round. Poll
      // instead of measuring straight away — measuring early reports count 0, which looks exactly
      // like a broken screen.
      await session.evaluate(`
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline && document.querySelectorAll('.st-stick').length === 0) {
          await new Promise((r) => setTimeout(r, 50));
        }
        return document.querySelectorAll('.st-stick').length;`);
      const m = await session.evaluate(`
        const sticks = [...document.querySelectorAll('.st-stick')];
        const boxes = sticks.map((s) => { const r = s.getBoundingClientRect(); return { w: r.width, h: r.height, top: Math.round(r.top) }; });
        const panel = document.querySelector('.st-stick-panel');
        const pr = panel ? panel.getBoundingClientRect() : null;
        return {
          count: boxes.length,
          minEdge: boxes.length ? Math.min(...boxes.map((b) => Math.min(b.w, b.h))) : null,
          minW: boxes.length ? Math.min(...boxes.map((b) => b.w)) : null,
          minH: boxes.length ? Math.min(...boxes.map((b) => b.h)) : null,
          rows: [...new Set(boxes.map((b) => b.top))].length,
          panelOverflow: pr ? Math.round(pr.right - document.documentElement.clientWidth) : null,
          docScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };`);
      rows.push({
        width: w,
        innerWidth: started.value?.innerWidth,
        n,
        ...m.value,
        pass: m.value?.count === n && m.value?.minEdge >= 44,
      });
    }
  }
  const bad = rows.filter((r) => !r.pass);
  return { total: rows.length, failing: bad.length, bad, all: rows };
}
