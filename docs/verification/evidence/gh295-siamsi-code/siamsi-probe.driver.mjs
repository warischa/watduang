// Walks /game/siamsi/ at two viewports: rest -> shake -> stick -> slip -> keep.
// Red = the default export throws after the walk, listing every failed check, so driver.mjs exits non-zero.
// SIAMSI_CONTROL=1 records the unfixed build (centred rows, slip replaced on keep) without throwing.
// Reads computed text-align on the slip paragraphs, the kept state, and writes screenshots when SHOT_DIR is set.
const BASE = process.env.BASE_URL || 'http://localhost:9361';
const SHOT_DIR = process.env.SHOT_DIR || '';
const VIEWPORTS = [[390, 844], [320, 568]];

const WALK_TO_SLIP = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms = 6000) => { const d = Date.now() + ms; while (Date.now() < d) { const v = fn(); if (v) return v; await sleep(40); } return null; };
  const armed = (id) => waitFor(() => { const b = document.getElementById(id); return b && !b.disabled ? b : null; });
  const go = await armed('ss-intent-done'); if (!go) return { error: 'no armed intent-done' };
  go.click();
  const hold = await armed('ss-hold'); if (!hold) return { error: 'no armed hold' };
  hold.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  const open = await waitFor(() => document.getElementById('ss-open-slip'));
  hold.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  if (!open) return { error: 'hold never released' };
  const o = await armed('ss-open-slip'); o.click();
  const keep = await armed('ss-keep'); if (!keep) return { error: 'no armed keep' };
  return { ok: true };
`;

const READ_ALIGN = `
  const ta = (el) => el ? getComputedStyle(el).textAlign : null;
  const rows = [...document.querySelectorAll('.sm-slip .sm-row p')];
  return {
    innerWidth,
    aspectCount: rows.length,
    aspect: rows.map(ta),
    closing: ta(document.querySelector('.sm-slip .sm-closing')),
    verse: ta(document.querySelector('.sm-slip .sm-verse')),
  };
`;

// Every expectation the walk records, as failed-check messages (empty = green).
function failures(out) {
  const fails = [];
  for (const [key, r] of Object.entries(out)) {
    if (key === 'consoleErrors') continue;
    const w = Number(key.split('x')[0]);
    for (const step of ['rest', 'shake', 'walk', 'slipAlign', 'kept']) {
      if (!r[step] || r[step].error) fails.push(`${key} ${step}: read failed (${r[step]?.error ?? 'nothing returned'})`);
    }
    if (r.rest && !r.rest.error && r.rest.innerWidth !== w) fails.push(`${key} rest: innerWidth ${r.rest.innerWidth}, run void`);
    if (r.shake && !r.shake.error && r.shake.onShake !== true) fails.push(`${key} shake: not on the shake screen`);
    if (r.walk && !r.walk.error && r.walk.ok !== true) fails.push(`${key} walk: did not reach the slip`);
    const a = r.slipAlign;
    if (a && !a.error) {
      if (a.innerWidth !== w) fails.push(`${key} slipAlign: innerWidth ${a.innerWidth}, run void`);
      if (!(a.aspectCount > 0)) fails.push(`${key} slipAlign: no aspect rows read`);
      if (!a.aspect?.every((t) => t === 'start')) fails.push(`${key} slipAlign: aspect text-align ${JSON.stringify(a.aspect)}, expected all start`);
      if (a.closing !== 'start') fails.push(`${key} slipAlign: closing text-align ${a.closing}, expected start`);
      if (a.verse !== 'center') fails.push(`${key} slipAlign: verse text-align ${a.verse}, expected center`);
    }
    const k = r.kept;
    if (k && !k.error) {
      if (k.slipStays !== true) fails.push(`${key} kept: slip did not stay`);
      if (k.sameNode !== true) fails.push(`${key} kept: slip node was replaced`);
      if (k.disabledAtOnce !== true) fails.push(`${key} kept: again was not disabled at once`);
      if (k.againArmedLater !== true) fails.push(`${key} kept: again never armed`);
      if (k.keepGone !== true || k.tieGone !== true) fails.push(`${key} kept: keep/tie controls still present`);
    }
  }
  return fails;
}

export default async function (session) {
  const out = {};
  for (const [w, h] of VIEWPORTS) {
    const key = `${w}x${h}`;
    await session.setWidth(w, h);
    await session.nav(`${BASE}/game/siamsi/`);
    await session.wipe();
    await session.nav(`${BASE}/game/siamsi/`);
    const r = {};
    // rest screen
    const rest = await session.evaluate(`
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      await sleep(600);
      const b = document.querySelector('.sm-barrel'); if (!b) return { error: 'no barrel' };
      b.scrollIntoView({ block: 'center' });
      return { innerWidth, ellipseFills: [...b.querySelectorAll('ellipse')].map((e) => e.getAttribute('fill')) };`);
    r.rest = rest.value ?? rest;
    if (SHOT_DIR) await session.screenshot(`${SHOT_DIR}/${key}-rest.png`);
    // shake screen
    const shake = await session.evaluate(`
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const d = Date.now() + 3000; let go;
      while (Date.now() < d) { go = document.getElementById('ss-intent-done'); if (go && !go.disabled) break; await sleep(40); }
      go.click(); await sleep(600);
      const b = document.querySelector('.sm-barrel'); b.scrollIntoView({ block: 'center' });
      return { onShake: !!document.getElementById('ss-hold') };`);
    r.shake = shake.value ?? shake;
    if (SHOT_DIR) await session.screenshot(`${SHOT_DIR}/${key}-shake.png`);
    // fresh walk to the slip
    await session.nav(`${BASE}/game/siamsi/`);
    const walked = await session.evaluate(WALK_TO_SLIP);
    r.walk = walked.value ?? walked;
    r.slipAlign = (await session.evaluate(READ_ALIGN)).value;
    // keep
    const kept = await session.evaluate(`
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const slip = document.querySelector('.sm-slip'); slip.__probeMark = 1;
      document.getElementById('ss-keep').click();
      const animsRightAfter = document.querySelector('.sm-slip') ? document.querySelector('.sm-slip').getAnimations().map((a) => a.animationName + ':' + a.playState) : null;
      const again = document.getElementById('ss-again');
      const disabledAtOnce = again ? again.disabled : null;
      await sleep(700);
      const s2 = document.querySelector('.sm-slip');
      const screen = document.querySelector('.stage-screen');
      const order = screen ? [...screen.children].map((c) => c.id || c.className || c.tagName) : null;
      const doneP = screen ? [...screen.children].find((c) => c.tagName === 'P') : null;
      (s2 || document.body).scrollIntoView({ block: 'end' });
      document.getElementById('ss-again')?.scrollIntoView({ block: 'end' });
      return {
        slipStays: !!s2, sameNode: !!(s2 && s2.__probeMark === 1), animsRightAfter, disabledAtOnce,
        againArmedLater: document.getElementById('ss-again') ? !document.getElementById('ss-again').disabled : null,
        keepGone: !document.getElementById('ss-keep'), tieGone: !document.getElementById('ss-tie'),
        order, doneText: doneP ? doneP.textContent : null, doneAlign: doneP ? getComputedStyle(doneP).textAlign : null,
      };`);
    r.kept = kept.value ?? kept;
    if (SHOT_DIR) await session.screenshot(`${SHOT_DIR}/${key}-slip-kept.png`);
    out[key] = r;
  }
  out.consoleErrors = session.consoleErrors;
  const fails = process.env.SIAMSI_CONTROL ? [] : failures(out);
  if (fails.length) throw new Error(`siamsi probe red (${fails.length}): ${fails.join(' | ')}`);
  return out;
}
