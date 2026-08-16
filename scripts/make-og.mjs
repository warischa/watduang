#!/usr/bin/env node
// Generate a game's OG image: node scripts/make-og.mjs <game-id> -> public/og/<game-id>.png (1200x630)
//
// Read before considering Pillow/PIL for an image with Thai text:
//   Pillow on this machine has no libraqm (`python3 -c "from PIL import features; print(features.check('raqm'))"`
//   -> False) so its normal text path skips complex-script shaping for Thai. Vowels and tone marks
//   don't compose onto the consonant and instead render as a dotted circle — the timebomb game's Thai name
//   comes out with its above-vowel stranded as a dotted circle instead of attached to the consonant
//   (that name carries a vowel but no tone mark — the mechanism strands both, this example shows one)
//   and it fails completely silently: the draw call succeeds, no error, no warning, file comes out whole, size correct.
//   This exact failure shipped to public/og/timebomb.png before (defect 3 of the adversarial review)
//   The path proven to work on this machine: SVG -> rsvg-convert (pango+fontconfig shapes Thai correctly) -> PNG
//
// Content rule (CLAUDE.md — covers OG images and thumbnails too): no images of bottles, cans,
// or logo'd glasses, ever — so this template's marks are pure geometric shapes only
//
// exit 0 doesn't mean the text is correct — open the image and look at it every time before shipping
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

// Tools must actually exist before starting — fail with install instructions, better than a silently broken image
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

// Same import style as scripts/validate-games.mjs — manifest.ts is written with the full .ts extension, no resolve hook needed
// Site-level cards (home page · game listing · 404) aren't games so they aren't in the manifest — made into an
// entry shaped just like a game, so the measure/wrap/render code below never has to know this case exists
const SITE = {
  id: 'site',
  names: { th: 'วัดดวง' },
  // The player-count line below already starts with '\u0E40\u0E25\u0E48\u0E19\u0E1F\u0E23\u0E35' ("play free"), so this field must
  // never repeat it. Escaped, not Thai script: the #36 gate counts any Thai character in a comment.
  tagline: 'เกมกลุ่มบนมือถือเครื่องเดียว ส่งวนกันทั้งวง',
  players: [2, 10],
};

const { games } = await import(path.join(root, 'src/games/manifest.ts'));
const game = id === SITE.id ? SITE : games.find((g) => g.id === id);
if (!game) {
  console.error(`make-og: ไม่มีเกม id "${id}" ใน src/games/manifest.ts (มีอยู่: ${games.map((g) => g.id).join(', ')}, site)`);
  process.exit(1);
}

// The card's tagline comes only from the tagline field — never silently fall back to seo.title/seo.description
// (both were tried: title gives a tagline missing "who loses" · description runs long into 4 small lines
//  and duplicates the player-count line) A card that quietly weakens is the same kind of failure as Thai text breaking with no error
const tagline = typeof game.tagline === 'string' ? game.tagline.trim() : '';
if (!tagline) {
  console.error(`make-og: เกม "${id}" ไม่มี tagline — เติม field tagline ใน src/games/${id}.ts ก่อน (ดูรูปแบบใน src/games/_template.ts)`);
  process.exit(1);
}

// ponytail: rough width estimate — Thai upper/lower vowels and tone marks don't add width, so they're excluded
// Ceiling: tied to Noto Sans Thai only — re-measure ink and reset the multiplier if the font ever changes
const COMBINING = /[ัิ-ฺ็-๎]/g;
// The multiplier comes from real ink measured on rsvg's render of 4 sentences: k = 0.476 / 0.493 / 0.527 / 0.549
// Deliberately using the max value -> always overestimates width, so text can never overlap the mark on the right
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

// Overflowing a column = shrink the whole block's font size, never break mid-Thai-word, because splitting
// between a consonant and a vowel that must compose produces the same dotted-circle result this script guards against
const fit = (texts, startSize, minSize, maxWidth, maxLines) => {
  for (let size = startSize; size > minSize; size -= 2) {
    const lines = texts.flatMap((t) => wrap(t, size, maxWidth));
    if (lines.length <= maxLines && lines.every((l) => widthAt(l, size) <= maxWidth)) return { size, lines };
  }
  // Still doesn't fit at the smallest size: drop the overflow lines rather than let them spill over the title/footer
  // (hit this for real testing a seo.description longer than the tagline)
  return { size: minSize, lines: texts.flatMap((t) => wrap(t, minSize, maxWidth)).slice(0, maxLines) };
};

const COL = 690; // x 90 -> 780 is the range that doesn't hit the circle mark on the right
const title = fit([game.names.th], 122, 60, COL, 1);
const sub = fit([tagline, `เล่นฟรี ${game.players[0]}-${game.players[1]} คน ไม่ต้องโหลดแอป`], 44, 28, COL, 3);
const subTop = 398 - ((sub.lines.length - 1) * 68) / 2; // keep the tagline block centered at the same spot regardless of line count
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ponytail: per-id map, ceiling noted at the timebomb incident — hit that ceiling since siamsi got dragged into the explosion mark
// Games without a mark yet get a text-only card — the fallback is deliberately "no image", not "another game's image"
// Every mark is a pure geometric shape, no bottles/cans/glasses, per the content rule
const MARKS = {
  timebomb: `
    <circle cx="0" cy="30" r="118" fill="#20233a" stroke="#ff5a3c" stroke-width="8"/>
    <rect x="-24" y="-108" width="48" height="32" rx="8" fill="#ff5a3c"/>
    <path d="M 0 -108 C 28 -148 74 -138 90 -172" fill="none" stroke="#f5c451" stroke-width="12" stroke-linecap="round"/>
    <circle cx="94" cy="-178" r="19" fill="#f5c451"/>
    <circle cx="-42" cy="-4" r="24" fill="#2c3050"/>`,
  // Site-level card: the watduang wheel, needle pointing up — not tied to any single game
  site: `
    <circle cx="0" cy="20" r="120" fill="none" stroke="#ff5a3c" stroke-width="8"/>
    <circle cx="0" cy="20" r="74" fill="#20233a"/>
    <path d="M 0 20 L 52 -46" fill="none" stroke="#f5c451" stroke-width="12" stroke-linecap="round"/>
    <circle cx="0" cy="20" r="16" fill="#f5c451"/>`,
  // siamsi tube + three sticks — the gold one in the middle is the drawn slip
  siamsi: `
    <rect x="-40" y="-158" width="16" height="164" rx="8" fill="#2c3050" transform="rotate(-16 -32 6)"/>
    <rect x="-8" y="-190" width="16" height="196" rx="8" fill="#f5c451"/>
    <rect x="24" y="-152" width="16" height="158" rx="8" fill="#2c3050" transform="rotate(16 32 6)"/>
    <rect x="-52" y="0" width="104" height="196" rx="14" fill="#20233a" stroke="#ff5a3c" stroke-width="8"/>
    <ellipse cx="0" cy="0" rx="52" ry="13" fill="#20233a" stroke="#ff5a3c" stroke-width="8"/>`,
};
// hasOwn, not MARKS[id] directly — an id like `constructor` passes the validator's regex
// and would pull something off the prototype into the SVG instead of falling through to the fallback
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
// -b = flatten onto an opaque background (an OG image with alpha turns black in LINE/X previews)
const render = spawnSync('rsvg-convert', ['-w', '1200', '-h', '630', '-b', BG, '-o', out], { input: svg });
if (render.status !== 0) {
  console.error(`make-og: rsvg-convert ล้มเหลว — ${render.stderr?.toString().trim() || 'ไม่มีข้อความ error'}`);
  writeFileSync(path.join(root, 'public/og', `${id}.debug.svg`), svg);
  process.exit(1);
}

// The cheapest real check that we got an actual file, not a half-written one — read the PNG's IHDR directly
const png = readFileSync(out);
const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
if (png.subarray(1, 4).toString() !== 'PNG' || w !== 1200 || h !== 630) {
  console.error(`make-og: ไฟล์ที่ได้ไม่ใช่ PNG 1200x630 (อ่านได้ ${w}x${h}) — อย่าใช้`);
  process.exit(1);
}
console.log(`make-og: public/og/${id}.png ${w}x${h} — เปิดดูด้วยตาก่อนใช้จริง รูปพังแบบเงียบๆ ได้`);
