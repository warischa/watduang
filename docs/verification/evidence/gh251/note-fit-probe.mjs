// gh#251: the draw and team status notes are bounded to two line boxes (height 3em, own scroll),
// a bound justified by measuring every legal status line at the OLD 13px size. At 16px the lines
// are longer, so re-measure: write each status string into the real note element and read whether
// its content still fits the box (scrollHeight <= clientHeight). Numbers use 3 digits (100 names).
// The last string per page is a deliberate control: a ~21-digit count, which must NOT fit, so a
// "fits" verdict is known to come from a detector that can say otherwise.
//   CDP_PORT=9381 node scripts/driver.mjs <this file>
const BASE = process.env.BASE || 'http://localhost:4381';
const CASES = {
  '/tool/draw/': [
    'ยังจับไม่ได้ — ใส่ชื่ออย่างน้อย 2 ชื่อ แล้วกด "ใส่ชื่อลงกล่อง"',
    'จับครบทั้ง 100 คนแล้ว — กด "เริ่มรอบใหม่" เพื่อคืนทุกชื่อเข้ากล่อง',
    'จำนวนที่จะจับต้องเป็นเลขจำนวนเต็มตั้งแต่ 1 ขึ้นไป',
    'เหลือในกล่องแค่ 100 คน จับ 999 คนไม่ได้ — ลดจำนวน หรือกด "เริ่มรอบใหม่"',
    'เหลือในกล่องแค่ 12 คน จับ 15 คนไม่ได้ — ลดจำนวน หรือกด "เริ่มรอบใหม่"',
    'เหลือในกล่องแค่ 3 คน จับ 5 คนไม่ได้ — ลดจำนวน หรือกด "เริ่มรอบใหม่"',
    'เหลือในกล่อง 100 คน',
    'CONTROL เหลือในกล่องแค่ 100 คน จับ 123456789012345678901 คนไม่ได้ — ลดจำนวน หรือกด "เริ่มรอบใหม่" อีกครั้ง',
  ],
  '/tool/team/': [
    'ยังแบ่งไม่ได้ — ใส่ชื่ออย่างน้อย 2 ชื่อ แล้วกด "ใส่ชื่อลงสนาม"',
    'จำนวนทีมต้องเป็นเลขจำนวนเต็มตั้งแต่ 1 ขึ้นไป',
    'ขอ 999 ทีมไม่ได้ เพราะมีคนแค่ 100 คน',
    'พร้อมแบ่ง 100 คน เป็น 100 ทีม',
    'CONTROL ขอ 123456789012345678901 ทีมไม่ได้ เพราะมีคนแค่ 100 คน ขอ 123456789012345678901 ทีมไม่ได้',
  ],
};
export default async function (session) {
  const out = [];
  for (const w of [320, 390]) {
    await session.setWidth(w, 900, true);
    for (const [path, texts] of Object.entries(CASES)) {
      await session.nav(`${BASE}${path}`);
      const r = await session.evaluate(`
        await document.fonts.ready;
        const el = document.querySelector('.draw-note, .team-note');
        const res = [];
        for (const t of ${JSON.stringify(texts)}) {
          el.textContent = t;
          const cs = getComputedStyle(el);
          res.push({ fs: cs.fontSize, fits: el.scrollHeight <= el.clientHeight, lines: Math.round(el.scrollHeight / parseFloat(cs.lineHeight)), text: t.slice(0, 24) });
        }
        return { innerWidth, res };
      `);
      out.push({ path, width: w, ...(r.value ?? { error: r.error }) });
    }
  }
  await session.close();
  return out;
}
