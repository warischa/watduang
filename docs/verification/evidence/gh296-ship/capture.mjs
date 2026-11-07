// gh#296 renders: /tool/wheel/ at 1100, 1280 and 1440 (mobile:false, dsf 1, reduced motion), full page
// JPEG q70, sliced with magick -crop into -partN when over 150KB. Initial state (no names) like the
// gh#296 board comparison set, plus one 1280 capture with eight names entered, taken 1.5s after the CTA so the
// names-in hold window (ADR-0016) has expired and the spin control shows its settled state.
// Run: CDP_PORT=9381 PROBE_BASE=http://localhost:4402 OUT=<dir> node scripts/driver.mjs <this file>
import { writeFileSync, statSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SHOTS = [
  { w: 1100, names: null }, { w: 1280, names: null }, { w: 1440, names: null },
  { w: 1280, names: 'บีม\\nมายด์\\nปอนด์\\nเจได\\nฟ้า\\nแทน\\nแก้ม\\nปาล์ม', tag: 'names' },
];
export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:4402';
  const OUT = process.env.OUT;
  const done = [];
  await session.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const s of SHOTS) {
    await session.setWidth(s.w, 900, false);
    await session.nav(`${base}/tool/wheel/`); await session.wipe(); await session.nav(`${base}/tool/wheel/`);
    if (s.names) await session.evaluate(`const ta = document.getElementById('name-input'); ta.value = '${s.names}'; ta.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('name-start').click(); await new Promise(r => setTimeout(r, 1500)); return true;`);
    const m = (await session.evaluate(`await document.fonts.ready; for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 30)); } scrollTo(0, 0); await new Promise(r => setTimeout(r, 200)); return { innerWidth, docHeight: document.documentElement.scrollHeight };`)).value;
    if (m.innerWidth !== s.w) throw new Error(`${s.w}: innerWidth ${m.innerWidth}, run void`);
    const shot = await session.cdp('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: true, clip: { x: 0, y: 0, width: s.w, height: m.docHeight, scale: 1 } });
    const name = `page-wheel-${s.w}${s.tag ? '-' + s.tag : ''}`;
    const file = `${OUT}/${name}.jpg`;
    writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    const size = statSync(file).size;
    const parts = Math.ceil(size / (140 * 1024));
    if (parts > 1) { execFileSync('magick', [file, '-crop', `100%x${Math.ceil(100 / parts)}%`, '+repage', `${OUT}/${name}-part%d.jpg`]); unlinkSync(file); }
    done.push({ name, w: s.w, docHeight: m.docHeight, bytes: size, parts });
  }
  await session.cdp('Emulation.setEmulatedMedia', { features: [] });
  return done;
}
