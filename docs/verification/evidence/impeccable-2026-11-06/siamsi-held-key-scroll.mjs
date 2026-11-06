// gh#295 REFUTE #3: hold Space on #ss-hold through the release (real CDP key events, auto-repeat),
// then keep it down 1s more. Does the page scroll once the button is gone?
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export default async function (session) {
  await session.setWidth(390, 844);
  await session.nav('http://localhost:4410/game/siamsi/');
  await session.wipe();
  await session.nav('http://localhost:4410/game/siamsi/');
  await wait(1000);
  let r = await session.evaluate(`const s = document.querySelector('#start-round, [id*="start"]'); if (s) s.click(); return s ? s.id : null;`);
  await wait(900);
  r = await session.evaluate(`const b = document.getElementById('ss-intent-done'); if (!b) return 'no intent'; b.click(); return 'ok';`);
  await wait(900);
  const pre = await session.evaluate(`const h = document.getElementById('ss-hold'); if (!h) return null; h.focus(); return { y: scrollY, max: document.documentElement.scrollHeight - innerHeight, focused: document.activeElement === h };`);
  const send = (type, autoRepeat) => session.cdp('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: type === 'keyDown' ? ' ' : undefined, autoRepeat });
  await send('keyDown', false);
  for (let i = 0; i < 80; i++) { await wait(33); await send('keyDown', true); }
  await send('keyUp', false);
  await wait(300);
  const post = await session.evaluate(`return { y: scrollY, stick: !!document.querySelector('.sm-number'), active: document.activeElement && (document.activeElement.id || document.activeElement.tagName) };`);
  return { pre: pre.value ?? pre, post: post.value ?? post };
}
