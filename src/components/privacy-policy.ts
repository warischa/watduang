// gh#295 B1 — the privacy policy at /privacy/, as data. The wording is the owner-approved text of
// 2026-11-07 (drafted on design/Gh295Privacy.dc.html, approved by popup), one entry per rendered line;
// src/pages/privacy.test.mjs holds it equal to the approved plain-text file line for line, so a wording
// change is an edit here and nowhere else. Plain data: the page adds the word joiners and the links at
// render time, so every string here is exactly the visible text.

export type PolicyBlock = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] };

export interface PolicySection {
  heading: string;
  blocks: PolicyBlock[];
}

export const POLICY = {
  title: 'นโยบายความเป็นส่วนตัว',
  lead: 'วัดดวงเล่นได้โดยไม่ต้องสมัครสมาชิกและไม่ต้องล็อกอิน หน้านี้บอกว่าเว็บไซต์เก็บข้อมูลอะไร เก็บไว้ที่ไหน และคุณจัดการได้อย่างไร',
  sections: [
    {
      heading: 'ข้อมูลที่อยู่ในเครื่องของคุณ',
      blocks: [
        { kind: 'p', text: 'เพื่อให้เล่นต่อได้โดยไม่ต้องพิมพ์ใหม่ เว็บไซต์จำสิ่งเหล่านี้ไว้ในเบราว์เซอร์ของคุณเอง' },
        {
          kind: 'ul',
          items: ['ชื่อผู้เล่นที่คุณใส่', 'รายชื่อในเครื่องมือสุ่ม และช่วงตัวเลขล่าสุด', 'การตั้งค่าเกม และการเปิดปิดเสียง'],
        },
        {
          kind: 'p',
          text: 'ข้อมูลของรอบที่กำลังเล่นอยู่เก็บไว้เฉพาะในแท็บนั้น และหายไปเมื่อปิดแท็บ ข้อมูลทั้งหมดนี้ไม่ถูกส่งออกจากเครื่องของคุณ คุณลบได้ทุกเมื่อด้วยการล้างข้อมูลเว็บไซต์ในการตั้งค่าเบราว์เซอร์',
        },
      ],
    },
    {
      heading: 'ข้อมูลที่คุณส่งมาเอง',
      blocks: [
        {
          kind: 'p',
          text: 'ถ้าคุณส่งความเห็นหรือเสนอเกมผ่านหน้าติชมและเสนอเกม เราจะได้รับข้อความที่คุณเขียน ชื่อเกมที่เสนอ อีเมลถ้าคุณกรอก และเวลาที่ส่ง เราใช้ข้อมูลนี้เพื่ออ่านและตอบกลับคุณ ข้อมูลเก็บในระบบจัดเก็บข้อมูลที่เว็บไซต์เช่าใช้ และมีเพียงผู้พัฒนาวัดดวงที่อ่าน เก็บไว้นานเท่าไรและขอลบได้อย่างไร ดูได้ที่หน้านั้น',
        },
      ],
    },
    {
      heading: 'คุกกี้และโฆษณา',
      blocks: [
        {
          kind: 'p',
          text: 'เว็บไซต์นี้ไม่ได้ตั้งคุกกี้เอง แต่อาจแสดงโฆษณาจาก Google ผู้ให้บริการภายนอก รวมถึง Google อาจใช้คุกกี้เพื่อแสดงโฆษณาตามการเข้าชมเว็บไซต์นี้และเว็บไซต์อื่นที่คุณเคยเข้า',
        },
        {
          kind: 'p',
          text: 'คุณปิดโฆษณาที่ปรับตามความสนใจได้ที่ adssettings.google.com และปิดคุกกี้ของผู้ให้บริการภายนอกได้ที่ optout.aboutads.info',
        },
        { kind: 'p', text: 'ถ้าเราใช้เครือข่ายโฆษณาอื่นนอกจาก Google จะระบุชื่อไว้ที่หน้านี้' },
      ],
    },
    {
      heading: 'สิทธิของคุณ',
      blocks: [
        {
          kind: 'p',
          text: 'คุณขอดู ขอแก้ไข ขอลบ หรือคัดค้านการใช้ข้อมูลที่คุณส่งมาได้ และร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคลได้ ส่งคำขอผ่านช่องทางติดต่อด้านล่าง',
        },
      ],
    },
    {
      heading: 'ติดต่อ',
      blocks: [
        { kind: 'p', text: 'ผู้ดูแลข้อมูล: ผู้พัฒนาวัดดวง' },
        { kind: 'p', text: 'ช่องทางติดต่อ: ส่งข้อความผ่านหน้าติชมและเสนอเกม' },
      ],
    },
    {
      heading: 'การเปลี่ยนแปลง',
      blocks: [{ kind: 'p', text: 'ถ้านโยบายนี้เปลี่ยน เราจะแก้ที่หน้านี้และเปลี่ยนวันที่ด้านล่าง' }],
    },
  ] satisfies PolicySection[],
  updated: 'ปรับปรุงล่าสุด 7 พฤศจิกายน 2569',
};

/** Every rendered line, in page order: the h1, the lead, each heading and its lines, the date line. */
export function policyLines(): string[] {
  return [
    POLICY.title,
    POLICY.lead,
    ...POLICY.sections.flatMap((s) => [s.heading, ...s.blocks.flatMap((b) => (b.kind === 'ul' ? b.items : [b.text]))]),
    POLICY.updated,
  ];
}

// The board's links in the policy text: the feedback page by its name, and the two ad opt-out pages by
// their bare domains, each opening in the same tab like every other link on the site.
const LINKS: ReadonlyArray<readonly [string, string]> = [
  ['หน้าติชมและเสนอเกม', '/feedback/'],
  ['adssettings.google.com', 'https://adssettings.google.com'],
  ['optout.aboutads.info', 'https://optout.aboutads.info/'],
];

export interface LinkRun {
  text: string;
  href?: string;
}

/** Splits one line into plain and linked runs; joined back, the runs are the line exactly. */
export function linkRuns(line: string): LinkRun[] {
  const runs: LinkRun[] = [];
  let rest = line;
  while (rest) {
    let hit: { at: number; text: string; href: string } | null = null;
    for (const [text, href] of LINKS) {
      const at = rest.indexOf(text);
      if (at >= 0 && (!hit || at < hit.at)) hit = { at, text, href };
    }
    if (!hit) {
      runs.push({ text: rest });
      break;
    }
    if (hit.at > 0) runs.push({ text: rest.slice(0, hit.at) });
    runs.push({ text: hit.text, href: hit.href });
    rest = rest.slice(hit.at + hit.text.length);
  }
  return runs;
}
