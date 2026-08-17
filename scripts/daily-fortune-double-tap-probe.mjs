// Falsifies the "tap-1 never lands on a different person or a navigating
// element" universal from docs/verification/evidence/34/12-daily-fortune-tap1-target.json,
// which was measured with a 2-name roster only. Run with an 8-name roster
// (below) against real headless Chrome via scripts/driver.mjs and it produces
// two CONFIRMED counter-examples: (1) tap-1 at the abandoned coordinate of
// the last chip lands on the hub link <a href="/games/"> (a double-tap
// navigates the group off their fortune), and (2) a double-tap on #df-again
// lands on a different person's chip on the next round's ask screen
// (reveal() would fire for the wrong person). Both are reachable because the
// post-tap DOM places interactive/navigating elements at coordinates the
// pre-tap DOM used for something else -- not because replaceChildren() fails
// to destroy the pre-tap DOM synchronously (it does; that part of the
// original reasoning still holds).
//
// Run: node scripts/driver.mjs scripts/daily-fortune-double-tap-probe.mjs
// (requires a real headless Chrome on CDP_PORT and dist/ served on :4321 --
// see scripts/driver.mjs's own header for the two things it needs Chrome for)
export default async function (session) {
  const base = 'http://localhost:4321';
  await session.nav(`${base}/game/daily-fortune/`);
  await session.setWidth(320, 900);
  await session.wipe();
  await session.nav(`${base}/game/daily-fortune/`);

  const players = ['สมชายใจดีมากพี่น้อง', 'ปู่ย่าตายาย', 'ก้องภพสุดหล่อ', 'น้ำหวานคนสวย', 'บีม', 'เจี๊ยบ', 'ต้นกล้าแห่งทุ่งนา', 'แพรวพราวสาวน้อย'];
  const start = await session.evaluate(`
    document.dispatchEvent(new CustomEvent('watduang:start', { detail: { players: ${JSON.stringify(players)} } }));
    return true;`);
  await new Promise((r) => setTimeout(r, 900));

  // Ask screen: all chip rects
  const ask = await session.evaluate(`
    const chips = [...document.querySelectorAll('#stage button')].filter(b => b.id !== 'df-go');
    return {
      innerWidth: window.innerWidth,
      chips: chips.map(c => { const r = c.getBoundingClientRect(); return { text: c.textContent, cx: r.left + r.width/2, cy: r.top + r.height/2, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }),
    };`);

  // Click the LAST (lowest) chip -> result screen
  const clickLast = await session.evaluate(`
    const chips = [...document.querySelectorAll('#stage button')].filter(b => b.id !== 'df-go');
    const c = chips[chips.length - 1];
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    c.click();
    const at = document.elementFromPoint(cx, cy);
    return { clickedChip: c.textContent, cx, cy,
      tap1Tag: at ? at.tagName : null, tap1Text: at ? (at.textContent||'').slice(0,40) : null,
      tap1IsAnchor: !!(at && at.closest && at.closest('a')),
      tap1AnchorHref: at && at.closest ? (at.closest('a')?.getAttribute('href') ?? null) : null,
      tap1IsButton: !!(at && at.closest && at.closest('button')) };`);

  // Result screen: rects of the interactive elements
  const result = await session.evaluate(`
    const again = document.getElementById('df-again');
    const hub = document.querySelector('#stage a');
    const rr = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, cx: r.left+r.width/2, cy: r.top+r.height/2 }; };
    return { again: rr(again), hub: rr(hub), hubHref: hub ? hub.getAttribute('href') : null };`);

  // Reverse transition: double-tap the #df-again button — click it, then elementFromPoint at its own
  // centre on the NEW (ask) screen. Comment stays English per CLAUDE.md; the selector is the stable
  // reference anyway, since the button's Thai label can be reworded without changing behaviour.
  const reverse = await session.evaluate(`
    const again = document.getElementById('df-again');
    const r = again.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    again.click();
    const at = document.elementFromPoint(cx, cy);
    const chip = at && at.closest ? at.closest('button') : null;
    return { againCx: cx, againCy: cy,
      tap1Tag: at ? at.tagName : null, tap1Text: at ? (at.textContent||'').slice(0,40) : null,
      landsOnButton: !!chip, buttonId: chip ? chip.id : null, buttonText: chip ? chip.textContent : null,
      wouldRevealDifferentPerson: !!(chip && chip.id !== 'df-go') };`);

  await session.screenshot(process.env.SP + '/df-refute-ask.png');
  return { ask, clickLast, result, reverse, consoleErrors: session.consoleErrors };
}
