// Must-red for the focus detector: a play route has no web.css, so its Tab outline must NOT read 3px ink offset 3px.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export default async function (s) {
  await s.nav('http://localhost:4333/game/bangkok-drift/play/');
  await s.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  const seen = [];
  for (let i = 0; i < 6; i++) {
    await s.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await s.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await sleep(60);
    seen.push((await s.evaluate(`const e = document.activeElement; const c = getComputedStyle(e); return {tag: e.tagName, fv: e.matches(':focus-visible'), w: c.outlineWidth, st: c.outlineStyle, col: c.outlineColor, off: c.outlineOffset};`)).value);
  }
  return { seen, anyMatchesWebRing: seen.some((r) => r.w === '3px' && r.st === 'solid' && r.col === 'rgb(20, 20, 43)' && r.off === '3px') };
}
