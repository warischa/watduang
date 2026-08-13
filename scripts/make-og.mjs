#!/usr/bin/env node
// สร้าง OG image ของเกม: node scripts/make-og.mjs <game-id> → public/og/<game-id>.png (1200x630)
//
// อ่านก่อนคิดจะใช้ Pillow/PIL ทำรูปที่มีตัวหนังสือไทย:
//   Pillow บนเครื่องนี้ไม่มี libraqm (`python3 -c "from PIL import features; print(features.check('raqm'))"`
//   → False) text path ปกติของมันจึงไม่ทำ complex-script shaping ของไทย สระและวรรณยุกต์จะไม่ประกอบกับ
//   พยัญชนะ แต่กลายเป็นวงกลมจุดไข่ปลา (dotted circle) — "ระเบิดเวลา" ออกมาเป็น "ระเบ ◌ ิ ดเวลา"
//   และมันพังแบบเงียบสนิท: draw call สำเร็จ ไม่ error ไม่ warning ไฟล์ออกมาครบ ขนาดถูก
//   รูปแบบนี้เคยหลุดขึ้น public/og/timebomb.png มาแล้ว (defect 3 ของ adversarial review)
//   เส้นทางที่พิสูจน์แล้วว่าใช้ได้บนเครื่องนี้: SVG → rsvg-convert (pango+fontconfig จัดรูปไทยถูก) → PNG
//
// กฎเนื้อหา (CLAUDE.md — ครอบคลุมถึง OG image และ thumbnail ด้วย): ห้ามมีภาพขวด กระป๋อง
// หรือแก้วที่มีโลโก้ ไม่ว่ากรณีใด เครื่องหมายในเทมเพลตนี้จึงเป็นรูปทรงเรขาคณิตล้วน
//
// exit 0 ไม่ได้แปลว่าตัวหนังสือถูก — เปิดรูปดูด้วยตาทุกครั้งก่อนปล่อยขึ้นเว็บ
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FONT = 'Noto Sans Thai';
const BG = '#141625';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const id = process.argv[2];
if (!id) {
  console.error('usage: node scripts/make-og.mjs <game-id>');
  process.exit(1);
}

// เครื่องมือต้องมีอยู่จริงก่อนเริ่ม — ล้มพร้อมบอกวิธีติดตั้ง ดีกว่าปล่อยรูปพังออกไปแบบเงียบๆ
const rsvg = spawnSync('rsvg-convert', ['--version'], { encoding: 'utf8' });
if (rsvg.error || rsvg.status !== 0) {
  console.error('make-og: ไม่พบคำสั่ง rsvg-convert (librsvg) — ติดตั้งด้วย `brew install librsvg` แล้วรันใหม่');
  process.exit(1);
}
const fonts = spawnSync('fc-list', [':family'], { encoding: 'utf8' });
if (!fonts.error && !(fonts.stdout ?? '').includes(FONT)) {
  console.error(`make-og: fontconfig ไม่รู้จักฟอนต์ "${FONT}" — pango จะ fallback ไปฟอนต์ที่ไม่มีอักขระไทย`);
  console.error('  ได้กล่องเปล่า (tofu) แทนตัวหนังสือ · ติดตั้ง Noto Sans Thai ลง ~/Library/Fonts แล้วรันใหม่');
  process.exit(1);
}

// import แบบเดียวกับ scripts/validate-games.mjs — manifest.ts เขียนนามสกุล .ts เต็ม ไม่ต้องมี resolve hook
// การ์ดระดับเว็บ (หน้าแรก · หน้ารวมเกม · 404) ไม่ใช่เกมจึงไม่มีใน manifest — ทำเป็น entry
// รูปทรงเดียวกับเกม โค้ดวัดตัวอักษร/wrap/เรนเดอร์ข้างล่างจะได้ไม่ต้องรู้เลยว่ามีเคสนี้อยู่
const SITE = {
  id: 'site',
  names: { th: 'วัดดวง' },
  // บรรทัดจำนวนคนข้างล่างขึ้นต้นด้วย "เล่นฟรี" อยู่แล้ว ตรงนี้จึงห้ามซ้ำคำนั้น
  tagline: 'เกมกลุ่มบนมือถือเครื่องเดียว ส่งวนกันทั้งวง',
  players: [2, 10],
};

const { games } = await import(path.join(root, 'src/games/manifest.ts'));
const game = id === SITE.id ? SITE : games.find((g) => g.id === id);
if (!game) {
  console.error(`make-og: ไม่มีเกม id "${id}" ใน src/games/manifest.ts (มีอยู่: ${games.map((g) => g.id).join(', ')}, site)`);
  process.exit(1);
}

// คำโปรยบนการ์ดมาจาก field tagline เท่านั้น — ห้ามถอยไปใช้ seo.title/seo.description เงียบๆ
// (ลองมาแล้วทั้งคู่: title ได้คำโปรยที่ไม่มี "ใครแพ้" · description ยาวจนกลายเป็น 4 บรรทัดตัวเล็ก
//  และซ้ำกับบรรทัดจำนวนคน) การ์ดที่อ่อนลงเงียบๆ คือรูปแบบความพังแบบเดียวกับรูปไทยที่แตกโดยไม่มี error
const tagline = typeof game.tagline === 'string' ? game.tagline.trim() : '';
if (!tagline) {
  console.error(`make-og: เกม "${id}" ไม่มี tagline — เติม field tagline ใน src/games/${id}.ts ก่อน (ดูรูปแบบใน src/games/_template.ts)`);
  process.exit(1);
}

// ponytail: ประมาณความกว้างแบบหยาบ — สระบน/ล่างและวรรณยุกต์ไทยไม่กินความกว้าง จึงไม่นับ
// เพดาน: ผูกกับ Noto Sans Thai เท่านั้น เปลี่ยนฟอนต์เมื่อไหร่ต้องวัดหมึกใหม่แล้วตั้งตัวคูณใหม่
const COMBINING = /[ัิ-ฺ็-๎]/g;
// ตัวคูณมาจากการวัดหมึกจริงที่ rsvg เรนเดอร์ 4 ประโยค: k = 0.476 / 0.493 / 0.527 / 0.549
// จงใจใช้ค่าสูงสุด → ประเมินกว้างเกินจริงเสมอ ตัวหนังสือจึงไม่มีทางไปทับเครื่องหมายด้านขวา
const widthAt = (text, size) => text.replace(COMBINING, '').length * size * 0.55;

const wrap = (text, size, maxWidth) => {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && widthAt(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
};

// ล้นคอลัมน์ = ย่อขนาดตัวอักษรทั้งบล็อก ห้ามตัดกลางคำไทยเด็ดขาด เพราะการตัดคั่นระหว่างพยัญชนะ
// กับสระที่ต้องประกอบกัน ให้ผลเป็น dotted circle แบบเดียวกับบั๊กที่สคริปต์นี้มีไว้กัน
const fit = (texts, startSize, minSize, maxWidth, maxLines) => {
  for (let size = startSize; size > minSize; size -= 2) {
    const lines = texts.flatMap((t) => wrap(t, size, maxWidth));
    if (lines.length <= maxLines && lines.every((l) => widthAt(l, size) <= maxWidth)) return { size, lines };
  }
  // เล็กสุดแล้วยังไม่พอ: ตัดบรรทัดส่วนเกินทิ้ง ดีกว่าปล่อยให้ล้นไปทับหัวเรื่อง/ท้ายภาพ
  // (เจอจริงตอนลองป้อน seo.description ที่ยาวกว่าคำโปรย)
  return { size: minSize, lines: texts.flatMap((t) => wrap(t, minSize, maxWidth)).slice(0, maxLines) };
};

const COL = 690; // x 90 → 780 คือช่วงที่ยังไม่ชนเครื่องหมายวงกลมด้านขวา
const title = fit([game.names.th], 122, 60, COL, 1);
const sub = fit([tagline, `เล่นฟรี ${game.players[0]}-${game.players[1]} คน ไม่ต้องโหลดแอป`], 44, 28, COL, 3);
const subTop = 398 - ((sub.lines.length - 1) * 68) / 2; // จัดบล็อกคำโปรยให้กึ่งกลางอยู่ที่เดิมเสมอ
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ponytail: map ต่อ id ตามเพดานที่จดไว้ตอน timebomb — ถึงเวลาแตกแล้วเพราะ siamsi ได้รูประเบิดไปด้วย
// เกมที่ยังไม่มีเครื่องหมายจะได้การ์ดตัวหนังสือล้วน ตั้งใจให้ fallback เป็น "ไม่มีรูป" ไม่ใช่ "รูปเกมอื่น"
// ทุกเครื่องหมายเป็นทรงเรขาคณิตล้วน ไม่มีขวด/กระป๋อง/แก้ว ตามกฎเนื้อหา
const MARKS = {
  timebomb: `
    <circle cx="0" cy="30" r="118" fill="#20233a" stroke="#ff5a3c" stroke-width="8"/>
    <rect x="-24" y="-108" width="48" height="32" rx="8" fill="#ff5a3c"/>
    <path d="M 0 -108 C 28 -148 74 -138 90 -172" fill="none" stroke="#f5c451" stroke-width="12" stroke-linecap="round"/>
    <circle cx="94" cy="-178" r="19" fill="#f5c451"/>
    <circle cx="-42" cy="-4" r="24" fill="#2c3050"/>`,
  // การ์ดระดับเว็บ: วงวัดดวง เข็มชี้ขึ้น — ไม่ผูกกับเกมใดเกมหนึ่ง
  site: `
    <circle cx="0" cy="20" r="120" fill="none" stroke="#ff5a3c" stroke-width="8"/>
    <circle cx="0" cy="20" r="74" fill="#20233a"/>
    <path d="M 0 20 L 52 -46" fill="none" stroke="#f5c451" stroke-width="12" stroke-linecap="round"/>
    <circle cx="0" cy="20" r="16" fill="#f5c451"/>`,
  // กระบอกเซียมซี + ไม้สามอัน อันกลางสีทองคือใบที่จั่วได้
  siamsi: `
    <rect x="-40" y="-158" width="16" height="164" rx="8" fill="#2c3050" transform="rotate(-16 -32 6)"/>
    <rect x="-8" y="-190" width="16" height="196" rx="8" fill="#f5c451"/>
    <rect x="24" y="-152" width="16" height="158" rx="8" fill="#2c3050" transform="rotate(16 32 6)"/>
    <rect x="-52" y="0" width="104" height="196" rx="14" fill="#20233a" stroke="#ff5a3c" stroke-width="8"/>
    <ellipse cx="0" cy="0" rx="52" ry="13" fill="#20233a" stroke="#ff5a3c" stroke-width="8"/>`,
};
// hasOwn ไม่ใช่ MARKS[id] ตรงๆ — id อย่าง `constructor` ผ่าน regex ของ validator ได้
// แล้วจะดึงของจาก prototype มายัดใส่ SVG แทนที่จะตกไปที่ fallback
const mark = Object.hasOwn(MARKS, id) ? `  <g transform="translate(950 330)">${MARKS[id]}\n  </g>` : '';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect x="0" y="0" width="1200" height="630" fill="${BG}"/>
  <rect x="0" y="0" width="1200" height="10" fill="#ff5a3c"/>
${mark}
  <text x="90" y="235" font-family="${FONT}" font-weight="bold" font-size="${title.size}" fill="#ffffff">${esc(title.lines[0])}</text>
${sub.lines
  .map(
    (line, i) =>
      `  <text x="90" y="${subTop + i * 68}" font-family="${FONT}" font-size="${sub.size}" fill="#c8cbe0">${esc(line)}</text>`,
  )
  .join('\n')}
  <text x="90" y="565" font-family="${FONT}" font-weight="bold" font-size="42" fill="#ff5a3c">watduang.com</text>
</svg>
`;

const out = path.join(root, 'public/og', `${id}.png`);
mkdirSync(path.dirname(out), { recursive: true });
// -b = ทับพื้นหลังทึบ (OG ที่มี alpha จะกลายเป็นดำใน preview ของ LINE/X)
const render = spawnSync('rsvg-convert', ['-w', '1200', '-h', '630', '-b', BG, '-o', out], { input: svg });
if (render.status !== 0) {
  console.error(`make-og: rsvg-convert ล้มเหลว — ${render.stderr?.toString().trim() || 'ไม่มีข้อความ error'}`);
  writeFileSync(path.join(root, 'public/og', `${id}.debug.svg`), svg);
  process.exit(1);
}

// เช็คที่ถูกที่สุดว่าได้ไฟล์จริง ไม่ใช่ไฟล์ครึ่งๆ — อ่าน IHDR ของ PNG ตรงๆ
const png = readFileSync(out);
const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
if (png.subarray(1, 4).toString() !== 'PNG' || w !== 1200 || h !== 630) {
  console.error(`make-og: ไฟล์ที่ได้ไม่ใช่ PNG 1200x630 (อ่านได้ ${w}x${h}) — อย่าใช้`);
  process.exit(1);
}
console.log(`make-og: public/og/${id}.png ${w}x${h} — เปิดดูด้วยตาก่อนใช้จริง รูปพังแบบเงียบๆ ได้`);
