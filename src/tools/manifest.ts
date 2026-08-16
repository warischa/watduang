// Display data for the 4 tool pages — the /tools/ hub and the home page both render from this.
// Lifted out of src/pages/tools/index.astro when the home page became a second consumer; two copies
// of the same {name, href} pairs drifting apart is the bug this removes.
// NOT the tools manifest ADR-0004 anticipates. CI's baseline slug set still lives in ci.yml
// (:130, :173), frozen at 4 by #11, and stays there until a 5th tool becomes possible.
export const tools = [
  { name: 'วงล้อสุ่มชื่อ', href: '/tool/wheel/', desc: 'ใส่ชื่อในวงแล้วกดหมุน รู้ทันทีว่าใครโดน หมุนเสร็จต่อเข้าเกมได้เลย' },
  { name: 'จับฉลาก', href: '/tool/draw/', desc: 'ใส่ชื่อทั้งวง เลือกว่าจะจั่วกี่คน กดทีเดียวรู้ผล คนที่ออกแล้วไม่ออกซ้ำในรอบเดิม' },
  { name: 'แบ่งทีม', href: '/tool/team/', desc: 'ใส่ชื่อแล้วบอกว่าอยากได้กี่ทีม แบ่งให้ทันที จำนวนคนแต่ละทีมต่างกันไม่เกินหนึ่งคน' },
  { name: 'สุ่มเลข', href: '/tool/number/', desc: 'ตั้งเลขต่ำสุดกับสูงสุดแล้วกดสุ่ม เลือกได้ว่าจะให้เลขซ้ำได้ หรือห้ามซ้ำในรอบเดียวกัน' },
];
