// Display data for the 4 tool pages — the /tools/ hub and the home page both render from this.
// Lifted out of src/pages/tools/index.astro when the home page became a second consumer; two copies
// of the same {name, href} pairs drifting apart is the bug this removes.
// NOT the tools manifest ADR-0004 anticipates. CI's baseline slug set still lives in ci.yml
// (:130, :173), frozen at 4 by #11, and stays there until a 5th tool becomes possible.
export const tools = [
  // gh#94 deleted the clause "หมุนเสร็จต่อเข้าเกมได้เลย" from the wheel's desc rather than rewording
  // it (owner ruling 2026-08-26, same call as gh#91 on the hub page): tools keep no roster
  // (ADR-0039) and the continue path now reaches one category, not every game, so the promise of an
  // uninterrupted carry-on into "a game" was no longer true. Nothing replaces it — a new clause
  // would be invented Thai. The wheel page's own intro line lost the same claim in gh#91.
  { name: 'วงล้อสุ่มชื่อ', href: '/tool/wheel/', desc: 'ใส่ชื่อในวงแล้วกดหมุน รู้ทันทีว่าใครโดน' },
  { name: 'จับฉลาก', href: '/tool/draw/', desc: 'ใส่ชื่อทั้งวง เลือกว่าจะจั่วกี่คน กดทีเดียวรู้ผล คนที่ออกแล้วไม่ออกซ้ำในรอบเดิม' },
  { name: 'แบ่งทีม', href: '/tool/team/', desc: 'ใส่ชื่อแล้วบอกว่าอยากได้กี่ทีม แบ่งให้ทันที จำนวนคนแต่ละทีมต่างกันไม่เกินหนึ่งคน' },
  { name: 'สุ่มเลข', href: '/tool/number/', desc: 'ตั้งเลขต่ำสุดกับสูงสุดแล้วกดสุ่ม เลือกได้ว่าจะให้เลขซ้ำได้ หรือห้ามซ้ำในรอบเดียวกัน' },
];

// The tools group's link and accent for the home page's tools section (gh#87) — its heading and
// body copy lived here while the neutral-hub cards needed them (gh#75); both were removed in gh#87
// (ADR-0034 records the reversal). The section copy itself lives on the page now. It lives here and
// not in src/games/categories.ts because the tools group is NOT a category — that record is keyed
// by the hand-written game union (ADR-0032), and adding a third key for tools would make every
// game's category check accept a value no game can hold.
// `accentVar` is a raw token name, not a CategoryMeta accent: --accent-sky has no manifest entry.
export const toolsGroup = {
  href: '/tools/',
  accentVar: '--accent-sky',
};
