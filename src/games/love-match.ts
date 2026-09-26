// Your Soulmate (gh#101) — one reader answers three questions and opens one draw. About eight times
// in ten they meet someone, drawn from a deck of forty character cards; about twice in ten the
// fortune is that they are their own. It replaced the two-person pair score that used to live in
// this file, whose "need two or more names" guard dead-ended every visitor once ADR-0040 made the
// fortune pages solo (the solo mount hands every module an empty group).
// Every string a reader sees is the signed-off copy in docs/copy/nuea-khu.md and its nuea-khu/
// card files, byte for byte; love-match.test.mjs compares the two, so an edit here that is not an
// edit there goes red.
// What the reader picks lives in this module's memory and nowhere else: no storage, no checkpoint,
// no session write, no URL. So siamsi stays the sole checkpoint writer (ADR-0010), and nothing here
// calls markPlayed either — the solo session would drop it, and there is nothing to remember.
// The .ts extension in the import path is required for `node --test` (Node does not guess
// extensions) — Vite/tsc accept it.
import type { GameContext, GameModule } from './types.ts';
import { armAllButtons } from './_arm-gate.ts';
import { el } from './_el.ts';

// ---- The deck: pure data, testable with no DOM (see love-match.test.mjs) ----

export type Gender = 'm' | 'f';

export interface Card {
  readonly id: string;
  readonly gender: Gender;
  readonly age: number;
  readonly height: number;
  readonly build: string;
  readonly nationality: string;
  readonly occupation: string;
  readonly means: string;
  readonly manner: string;
  readonly habit: string;
  readonly mark: string;
  /** Basename under public/art/nuea-khu/. Spelled whole on purpose: scripts/public-orphan-check.mjs
   *  finds a published file's referrer by its basename token, and a name assembled at runtime from
   *  parts would ship every portrait as an orphan in that gate's eyes. */
  readonly portrait: string;
}

// One string per card, fields in the copy's own order after gender (which the list carries):
// age | height | build | nationality | occupation | means | manner | habit | mark | portrait.
// Packed rather than written as objects because this chunk counts toward the bundle freeze and forty
// cards of field names would cost more than the parse below. An empty nationality means the card
// says "ไทย" — thirty-six of the forty do. Card ids are positional: the Nth male string is card MN.
// Portraits map card to deck file through the gh#103 section of images/IMAGES.md.
const MALE = [
  '29|172|ผอมสูง||ครูสอนดนตรี|มีรายได้ประจำ ไม่ถึงกับสบาย|พูดน้อยแต่ยิ้มง่าย|ฮัมเพลงตอนคิดอะไรไม่ออก|แผลเป็นเล็กๆ ที่คิ้วซ้าย|IMG_01_041.webp',
  '34|178|ท้วมสมส่วน||หมอฟัน มีคลินิกของตัวเอง|สบาย|เรียบร้อยจนดูเกร็ง|จัดของบนโต๊ะให้ตรงเสมอ|ไฝเม็ดเดียวใต้ตาขวา|IMG_01_042.webp',
  '27|168|ล่ำ||ช่างซ่อมจักรยาน ร้านเล็กๆ ของตัวเอง|พอดีตัว|ตรงไปตรงมา ไม่อ้อมค้อม|ล้างมือสามรอบก่อนกินข้าว|รอยด้านที่ฝ่ามือขวา|IMG_01_043.webp',
  '38|175|สูงโปร่ง||นักบัญชีบริษัท|มั่นคง|ใจเย็นกว่าคนวัยเดียวกัน|พกสมุดจดเล่มเล็กติดตัวตลอด|ผมหงอกกระจุกเดียวเหนือหน้าผาก|IMG_01_044.webp',
  '31|170|ผอม||ขายต้นไม้ที่ตลาดนัด|พอใช้|ช้าๆ แต่ไม่เคยลืมอะไร|เรียกต้นไม้ทุกต้นด้วยชื่อ|รอยสักเส้นเล็กๆ รูปใบไม้ที่ข้อมือ|IMG_01_045.webp',
  '44|174|ท้วม||พ่อครัว เปิดร้านข้าวแกงของตัวเอง|พอดีตัว|หน้าดุ แต่ใจอ่อน|ชิมอาหารร้านอื่นแล้วกลับมาทำเลียนแบบ|รอยไหม้จางๆ ที่หลังมือขวา|IMG_01_011.webp',
  '26|178|ผอมสูง||โค้ชสอนว่ายน้ำเด็ก|พอใช้|ร่าเริง คุยกับทุกคนที่เจอ|นับจังหวะหายใจเวลาตื่นเต้น|แผลเป็นเส้นสั้นๆ ที่คาง|IMG_01_012.webp',
  '52|170|สมส่วน||ช่างตัดผม เปิดร้านเล็กๆ ในซอยมายี่สิบปี|พอใช้|อารมณ์ดี เล่าเรื่องเก่งกว่าตัดผม|หวีผมตัวเองทุกครั้งที่เดินผ่านกระจก|ผมขาวทั้งหัว ตัดเรียบกริบ|IMG_01_013.webp',
  '33|180|ล่ำสัน||ครูฝึกมวยไทย|รายได้ไม่แน่นอน ขึ้นกับจำนวนลูกศิษย์|สุภาพจนน่าแปลกใจสำหรับคนตัวใหญ่ขนาดนี้|ตื่นมาวิ่งตอนตีห้าทุกวัน|สันจมูกเบี้ยวเล็กน้อยจากการซ้อม|IMG_01_014.webp',
  '41|172|ผอม|ญี่ปุ่น|ช่างซ่อมนาฬิกา|พอดีตัว|พูดช้า คิดก่อนพูดทุกคำ|ตั้งนาฬิกาทุกเรือนในบ้านให้ตรงกันทุกวันอาทิตย์|คิ้วหนาเป็นแนวตรงเกือบชนกัน|IMG_01_015.webp',
  '29|169|สมส่วน||นักดับเพลิง|มีรายได้ประจำ พร้อมสวัสดิการ|กล้า แต่ไม่บ้าบิ่น|เช็กปลั๊กไฟทุกจุดก่อนออกจากบ้าน|แผลเป็นรูปจันทร์เสี้ยวที่ข้างคอ|IMG_01_016.webp',
  '36|177|สูงโปร่ง||นักบินสายการบินในประเทศ|สบาย|มั่นใจ แต่ไม่อวด|เช็กพยากรณ์อากาศวันละหลายรอบแม้วันที่ไม่ได้บิน|ผมหงอกประปรายที่ขมับ|IMG_01_017.webp',
  '47|171|ท้วม||ช่างไม้ รับทำเฟอร์นิเจอร์ตามสั่ง|พอใช้ งานเข้าไม่ขาด|พูดน้อย ทำมากกว่าพูด|เหน็บดินสอไว้หลังหูตลอดเวลา|หนวดเคราสั้นสีดอกเลา|IMG_01_018.webp',
  '25|173|ผอม||นักวาดภาพประกอบอิสระ|รายได้ไม่แน่นอน บางเดือนดี บางเดือนแย่|ขี้อาย แต่พอคุยเรื่องที่ชอบแล้วตาเป็นประกาย|ซื้อสีเพิ่มทั้งที่ของเก่ายังไม่หมด|แว่นกรอบหนาที่ต้องดันขึ้นบ่อยๆ|IMG_01_019.webp',
  '39|182|ล่ำ|ลาว|วิศวกรโยธา คุมงานก่อสร้าง|มั่นคง|จริงจัง แต่ขำง่ายเวลาคนอื่นเล่นมุก|มาถึงที่นัดก่อนเวลาสิบห้านาทีเสมอ|ลักยิ้มข้างเดียวที่แก้มขวา|IMG_01_020.webp',
  '31|166|ตัวเล็ก||ช่างภาพงานแต่งงานอิสระ|รายได้ขึ้นลงตามฤดูแต่งงาน|ช่างสังเกต เห็นรายละเอียดที่คนอื่นมองข้าม|ถ่ายรูปท้องฟ้าทุกเย็น|ต่างหูห่วงเล็กๆ ข้างเดียวที่หูซ้าย|IMG_01_021.webp',
  '54|168|สมส่วน||ชาวสวนผลไม้ มีสวนของตัวเอง|สบายแบบไม่หวือหวา|อบอุ่น ใจเย็น ชอบสอนคนอื่นโดยไม่รู้ตัว|แจกผลไม้ให้เพื่อนบ้านทุกครั้งที่เก็บได้|ตีนกาลึกชัดเวลายิ้ม|IMG_01_022.webp',
  '28|175|สมส่วน||บุรุษไปรษณีย์|เงินเดือนไม่มาก แต่มั่นคง|ยิ้มทักทุกบ้านที่ผ่าน|จำชื่อหมาทุกตัวในเขตที่ส่งจดหมาย|หูกางชัด|IMG_01_023.webp',
  '43|170|ท้วมสมส่วน||เภสัชกร มีร้านขายยาของตัวเอง|สบาย|ละเอียดรอบคอบ อธิบายเก่ง|จำวันหมดอายุของทุกอย่างในตู้เย็นได้|หน้าผากกว้างจากผมที่เริ่มถอยร่น|IMG_01_024.webp',
  '35|179|ผอมสูง||สัตวแพทย์รักษาหมาแมว|มั่นคง|อ่อนโยนกับสัตว์ แต่เก้ๆ กังๆ กับคน|มีขนแมวติดเสื้อทุกวันแม้เพิ่งเปลี่ยนเสื้อ|รอยข่วนจางๆ หลายเส้นที่หลังมือซ้าย|IMG_01_025.webp',
];
const FEMALE = [
  '30|160|ผอมบาง||พยาบาลเวรกลางคืน|พอใช้ เพราะทำโอทีบ่อย|ใจดีแบบไม่ต้องพูดเยอะ|กินของหวานตอนตีสอง|ไฝเล็กๆ กลางคาง|IMG_01_046.webp',
  '33|165|สมส่วน||เจ้าของร้านกาแฟเล็กๆ|สบายพอตัว|คุยเก่ง จำชื่อคนได้แม่น|ชิมกาแฟก่อนเสิร์ฟทุกแก้วแม้จะรู้ว่าอร่อย|แผลเป็นบางๆ ที่หลังมือซ้าย|IMG_01_047.webp',
  '36|168|สูงผอม||สถาปนิก|มั่นคง|เถียงเก่งแต่ไม่ถือโทษ|วาดเส้นเล่นบนขอบกระดาษเวลาฟังคนอื่นพูด|ตาสองข้างสีไม่เท่ากัน|IMG_01_048.webp',
  '26|155|ตัวเล็ก||ครูอนุบาล|รายได้น้อยแต่ไม่เดือดร้อน|เสียงดังและหัวเราะง่าย|ร้องเพลงกล่อมตัวเองเวลาเครียด|ฟันหน้าซี่หนึ่งเกยเล็กน้อย|IMG_01_049.webp',
  '41|163|ท้วม||นักแปลอิสระ|ไม่แน่นอนแต่พออยู่ได้|เงียบ แต่พอเริ่มพูดแล้วหยุดยาก|อ่านหนังสือทีละสามเล่มสลับกัน|ปอยผมหน้าม้าที่ไม่เคยอยู่ทรง|IMG_01_050.webp',
  '28|162|สมส่วน||คนทำขนมปัง เปิดร้านเบเกอรี่เล็กๆ ของตัวเอง|พอดีตัว|อารมณ์ดีตั้งแต่เช้ามืด|ตื่นตีสามทุกวันแม้วันหยุด|กระเล็กๆ เต็มสันจมูก|IMG_01_026.webp',
  '45|158|ท้วม||แม่ค้าผลไม้ในตลาดเช้า|พอใช้|ปากร้าย ใจดี|แถมของให้ลูกค้าประจำทุกครั้ง|ปานสีน้ำตาลอ่อนที่ข้างคอ|IMG_01_027.webp',
  '32|170|สูงผอม||ทนายความ|สบาย|พูดตรง คม แต่ยุติธรรม|อ่านทุกอย่างจนถึงบรรทัดสุดท้าย แม้แต่ใบเสร็จ|ไฝเม็ดเล็กเหนือริมฝีปากซ้าย|IMG_01_028.webp',
  '27|164|ผอมบาง||ครูสอนเต้นร่วมสมัย|รายได้น้อย แต่ได้ทำสิ่งที่รัก|อ่อนโยน เคลื่อนไหวเบาเหมือนไม่มีน้ำหนัก|ยืดเส้นทุกครั้งที่ต้องยืนรอ|ผมมวยสูงที่ไม่เคยมีใครเห็นปล่อยลงมา|IMG_01_029.webp',
  '38|160|สมส่วน||ช่างตัดเสื้อ รับตัดเย็บที่บ้าน|พอดีตัว|เนี้ยบ ช่างติ แต่ติด้วยความหวังดี|มองตะเข็บเสื้อคนอื่นก่อนมองหน้า|ผมยาวถักเปียข้างเดียวพาดไหล่|IMG_01_030.webp',
  '50|157|ท้วม||ครูใหญ่โรงเรียนประถม|มั่นคง|เข้มงวด แต่คนรักทั้งโรงเรียน|พกลูกอมไว้ในกระเป๋าเสื้อแจกเด็กเสมอ|ผมสั้นสีดอกเลาทรงบ๊อบ|IMG_01_031.webp',
  '29|166|ล่ำ||นักกายภาพบำบัด|มีรายได้ประจำ|ร่าเริง ให้กำลังใจเก่ง|ไม่ยอมนอนถ้ายังเดินไม่ถึงหมื่นก้าว|ผมสั้นเกรียนแบบนักกีฬา|IMG_01_032.webp',
  '35|163|สมส่วน|เวียดนาม|เจ้าของร้านดอกไม้|สบายพอตัวช่วงเทศกาล|ละเมียด ใจเย็น|เปลี่ยนดอกไม้ในแจกันที่บ้านทุกสามวัน|เจาะหูสามรูข้างเดียว|IMG_01_033.webp',
  '42|168|สูงโปร่ง||วิศวกรซอฟต์แวร์|สบาย|พูดน้อย คิดเร็ว ตลกแบบหน้านิ่ง|ซื้อต้นไม้มาแล้วลืมรดน้ำ|หน้าม้าตรงเป๊ะเหมือนใช้ไม้บรรทัดตัด|IMG_01_034.webp',
  '25|159|ตัวเล็ก||พนักงานต้อนรับบนเครื่องบิน|มีรายได้ประจำ บวกเบี้ยเลี้ยงเดินทาง|ยิ้มง่าย แต่เด็ดขาดเวลามีเรื่อง|จัดกระเป๋าเดินทางเสร็จภายในสิบนาทีเสมอ|ลักยิ้มสองข้าง|IMG_01_035.webp',
  '47|165|สมส่วน||ช่างปั้นเซรามิก|ขายงานได้เป็นช่วงๆ พออยู่ได้|นิ่ง สุขุม พูดทีละคำ|เปิดวิทยุเพลงเก่าฟังทั้งวันตอนทำงาน|ริ้วรอยระหว่างคิ้วจากการขมวดคิ้วตอนตั้งใจ|IMG_01_036.webp',
  '31|167|สมส่วน||เจ้าหน้าที่พิทักษ์ป่า|เงินเดือนไม่มาก แต่มั่นคง|กล้า ลุย ไม่บ่น|จดชื่อนกที่เห็นทุกเช้าลงสมุด|แผลเป็นเล็กๆ ที่ปลายจมูก|IMG_01_037.webp',
  '39|161|ผอม||บรรณารักษ์ห้องสมุดประชาชน|มั่นคงแต่ไม่หวือหวา|เงียบ แต่ขำตัวเองบ่อย|ดมกลิ่นหนังสือทุกเล่มก่อนเปิดอ่าน|ผมหยิกฟูเป็นลอนแน่น|IMG_01_038.webp',
  '53|160|ท้วม||เจ้าของร้านก๋วยเตี๋ยวที่ขายมาสามสิบปี|สบายพอตัว|ใจกว้าง ยิ้มทั้งตา|เรียกลูกค้าทุกคนว่าลูก|ผมขาวแซม มัดรวบต่ำที่ท้ายทอย|IMG_01_039.webp',
  '34|169|สูงโปร่ง|มาเลเซีย|ช่างซ่อมรถยนต์ มีอู่ของตัวเอง|พอดีตัว|ใจร้อน แต่ขอโทษเป็น|ฟังเสียงรถที่ขับผ่านแล้วบอกได้ว่าเสียตรงไหน|แผลเป็นเส้นบางที่โหนกแก้มขวา|IMG_01_040.webp',
];

const toCard = (gender: Gender) => (packed: string, i: number): Card => {
  const [age, height, build, nationality, occupation, means, manner, habit, mark, portrait] = packed.split('|') as [
    string, string, string, string, string, string, string, string, string, string,
  ];
  return {
    id: `${gender === 'm' ? 'M' : 'F'}${i + 1}`,
    gender,
    age: Number(age),
    height: Number(height),
    build,
    nationality: nationality || 'ไทย',
    occupation,
    means,
    manner,
    habit,
    mark,
    portrait,
  };
};

export const CARDS: readonly Card[] = [...MALE.map(toCard('m')), ...FEMALE.map(toCard('f'))];

/** The card's labelled lines, in the copy's order. The values join with the copy's own separator
 *  into exactly the line the card files hold — that is what the test compares. */
export function cardRows(c: Card): [label: string, value: string][] {
  return [
    ['เพศ', c.gender === 'm' ? 'ชาย' : 'หญิง'],
    ['อายุ', String(c.age)],
    ['ส่วนสูง', `${c.height} ซม.`],
    ['รูปร่าง', c.build],
    ['สัญชาติ', c.nationality],
    ['อาชีพ', c.occupation],
    ['ฐานะ', c.means],
    ['ท่าที', c.manner],
    ['นิสัยติดตัว', c.habit],
    ['จุดสังเกต', c.mark],
  ];
}

// ---- The draw ----

export interface Band {
  readonly label: string;
  /** Inclusive meeting-age range, always above the band's top. `null` only for the open band, which
   *  has no top to be above and answers in years from now instead. */
  readonly meet: readonly [number, number] | null;
}

/** The signed-off per-band table. Every closed range starts above its band's top, which is what
 *  makes "never predicts the past" true by construction: the draw has no lower number to produce. */
export const BANDS: readonly Band[] = [
  { label: '18–24', meet: [25, 29] },
  { label: '25–29', meet: [30, 34] },
  { label: '30–34', meet: [35, 39] },
  { label: '35–39', meet: [40, 44] },
  { label: '40–49', meet: [50, 55] },
  { label: '50 ขึ้นไป', meet: null },
];

/** The open band's relative form, in years from now: above the reader's own age by construction. */
export const OPEN_BAND_YEARS: readonly [number, number] = [2, 5];
/** Owner ruling on gh#101 (2026-09-26): a card is drawn only from cards within this many years of
 *  the drawn meeting age. Smallest pool it leaves is three per gender, near meeting ages 53 to 55. */
export const AGE_WINDOW = 8;
/** Same ruling: at the open band there is no meeting age, so the pool is the cards aged this or over
 *  (three male, four female). Lowering it to 42 gives five per gender — offered, not taken. */
export const OPEN_BAND_CARD_FLOOR = 45;
/** About eight in ten meet someone. */
export const MEET_ODDS = 0.8;

export const PLACES: readonly string[] = [
  'ร้านหนังสือมือสอง', 'คิวรอรถเมล์ตอนฝนตก', 'งานวิ่งการกุศล', 'ห้องสมุดประชาชน', 'ร้านซักผ้าหยอดเหรียญ',
  'ตลาดนัดเช้าวันเสาร์', 'งานแต่งของเพื่อนคนเดียวกัน', 'คลาสเรียนทำอาหาร', 'ร้านตัดผม', 'สนามบินตอนไฟลต์ดีเลย์',
];

export const SELF_VARIANTS: readonly { heading: string; body: string }[] = [
  { heading: 'เนื้อคู่ของคุณคือตัวคุณเอง', body: 'คนที่อยู่ด้วยได้ทุกวันโดยไม่เบื่อ มีอยู่คนเดียว และคนนั้นก็คือคุณ รอบนี้ดวงบอกให้ใช้เวลากับตัวเองให้คุ้ม' },
  { heading: 'รอบนี้ดวงไม่ได้พาใครมา', body: 'ไม่ใช่เพราะไม่มีใคร แต่เพราะตอนนี้คุณสนุกกับชีวิตตัวเองมากพอ จนยังไม่ต้องแบ่งเวลาให้ใคร' },
  { heading: 'ดวงบอกว่าคุณเต็มอยู่แล้ว', body: 'บางคนต้องมีอีกคนมาเติมให้ครบ บางคนครบมาตั้งแต่แรก คุณอยู่ในกลุ่มหลัง' },
  { heading: 'รอบนี้ยังไม่มีชื่อใคร', body: 'ไม่ได้แปลว่าขาด แปลว่าตอนนี้คุณไม่ต้องรอใครก่อนจะมีความสุข' },
];

/** The cards a draw may hand out: the wanted gender, within AGE_WINDOW of the meeting age, or at
 *  the open band (no meeting age) the cards aged OPEN_BAND_CARD_FLOOR and over. */
export function cardPool(band: number, want: Gender, meetAge?: number): Card[] {
  return CARDS.filter(
    (c) => c.gender === want && (BANDS[band]!.meet ? Math.abs(c.age - meetAge!) <= AGE_WINDOW : c.age >= OPEN_BAND_CARD_FLOOR),
  );
}

export type Reading =
  | { kind: 'meet'; card: Card; place: string; age?: number; years?: number }
  | { kind: 'self'; variant: number };

const pick = <T>(rand: () => number, list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
const between = (rand: () => number, [lo, hi]: readonly [number, number]): number => lo + Math.floor(rand() * (hi - lo + 1));

/** One draw. `rand` is injected so the tests never touch Math.random. */
export function drawReading(band: number, want: Gender, rand: () => number = Math.random): Reading {
  if (rand() >= MEET_ODDS) return { kind: 'self', variant: Math.floor(rand() * SELF_VARIANTS.length) };
  const meet = BANDS[band]!.meet;
  const age = meet ? between(rand, meet) : undefined;
  const years = meet ? undefined : between(rand, OPEN_BAND_YEARS);
  return { kind: 'meet', card: pick(rand, cardPool(band, want, age)), place: pick(rand, PLACES), age, years };
}

// ---- Current screen state (one game per page) ----

let cleanup: Array<() => void> = [];
let stageEl: HTMLElement | null = null;
// The three answers. In memory only, and dropped on dispose — see the header.
let me: Gender | null = null;
let band: number | null = null;
let want: Gender | null = null;
// The wanted gender follows the opposite of the reader's own until the reader picks it themselves.
let wantChosen = false;

// ponytail: `cleanup` grows across ask-result cycles instead of being drained per render, so the
// removal closures pin detached nodes until dispose(). Bounded and released on every game switch;
// same trade as daily-fortune.ts.
function on(target: EventTarget, type: string, handler: EventListener): void {
  target.addEventListener(type, handler);
  cleanup.push(() => target.removeEventListener(type, handler));
}

// ---- Screens ----
// Styles live in src/styles/games/love-match.css under the `lm-` prefix. No outbound link is built
// anywhere in this file: #stage holds no navigation target (ADR-0014); the page's crawlable link is
// static chrome in src/layouts/GameLayout.astro, above the stage.

/** One question: a label and a row of toggle buttons. Toggles rather than radios so the arm gate,
 *  which walks buttons, covers them on every render the way it covers every other control. */
function question(
  stage: HTMLElement,
  id: string,
  label: string,
  options: readonly string[],
  keys: readonly (string | number)[],
  selected: () => number | null,
  choose: (i: number) => void,
  sync: () => void,
): () => void {
  const labelEl = el('p', label);
  labelEl.className = 'lm-q';
  labelEl.id = `lm-q-${id}`;
  const row = el('div');
  row.className = 'lm-opts';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-labelledby', labelEl.id);
  const buttons = options.map((text, i) => {
    const b = el('button', text);
    b.type = 'button';
    b.id = `lm-${id}-${keys[i]}`;
    b.className = 'lm-choice';
    on(b, 'click', () => {
      choose(i);
      sync();
    });
    row.appendChild(b);
    return b;
  });
  const box = el('div');
  box.className = 'lm-qbox';
  box.appendChild(labelEl);
  box.appendChild(row);
  stage.appendChild(box);
  return () => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(selected() === i)));
}

const GENDERS: readonly Gender[] = ['m', 'f'];
const GENDER_OPTIONS = ['ผู้ชาย', 'ผู้หญิง'];

function renderAsk(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  const title = el('p', 'เนื้อคู่ของคุณ');
  title.className = 'lm-heading';
  stage.appendChild(title);
  stage.appendChild(el('p', 'ตอบสามข้อ แล้วเปิดดูครั้งเดียว'));

  const go = el('button', 'เปิดดูเนื้อคู่');
  const refresh: Array<() => void> = [];
  // The open control's enabled state belongs to this screen: disabled until all three are answered.
  // The arm gate leaves a control it found disabled alone when its window closes, and every answer
  // re-runs this after the window, so the gate never has to know the rule.
  const sync = (): void => {
    refresh.forEach((r) => r());
    go.disabled = me === null || band === null || want === null;
  };
  const gi = (g: Gender | null): number | null => (g === null ? null : GENDERS.indexOf(g));

  refresh.push(question(stage, 'me', 'คุณเป็น', GENDER_OPTIONS, GENDERS, () => gi(me), (i) => {
    me = GENDERS[i]!;
    if (!wantChosen) want = GENDERS[1 - i]!;
  }, sync));
  refresh.push(question(stage, 'band', 'อายุของคุณ', BANDS.map((b) => b.label), BANDS.map((_, i) => i), () => band, (i) => {
    band = i;
  }, sync));
  refresh.push(question(stage, 'want', 'อยากให้เนื้อคู่เป็น', GENDER_OPTIONS, GENDERS, () => gi(want), (i) => {
    want = GENDERS[i]!;
    wantChosen = true;
  }, sync));

  const privacy = el('p', 'ที่ตอบไว้อยู่แค่ในหน้านี้รอบเดียว ไม่ได้บันทึก ไม่ได้อยู่ในลิงก์ ไม่ได้ส่งไปไหน');
  privacy.className = 'lm-note';
  stage.appendChild(privacy);

  go.id = 'lm-go';
  go.type = 'button';
  go.className = 'game-btn game-btn-primary';
  on(go, 'click', () => {
    if (me !== null && band !== null && want !== null) renderReading(drawReading(band, want));
  });
  stage.appendChild(go);
  sync();

  // Every way into this screen (mount, and the redo from a reading) swaps the stage under the finger
  // that just tapped, so every control here waits out the arm window.
  cleanup.push(armAllButtons(stage));
}

// The self branch's one piece of art, drawn and never an image (criterion 5). Presentation attributes
// resolve var(), the way daily-fortune's sun does.
const SELF_SVG =
  '<svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true">' +
  '<circle cx="48" cy="48" r="30" fill="var(--page-accent)" stroke="var(--color-line-strong)" stroke-width="3"></circle>' +
  '<path d="M37 52q11 10 22 0" stroke="var(--color-line-strong)" stroke-width="3" stroke-linecap="round"></path></svg>';

function renderReading(r: Reading): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  const add = (text: string, cls: string): void => {
    const p = el('p', text);
    p.className = cls;
    stage.appendChild(p);
  };

  let closing: string;
  if (r.kind === 'meet') {
    add('คุณจะได้เจอเขา', 'lm-heading');
    add(r.age !== undefined ? `ตอนคุณอายุ ${r.age} ปี` : `อีกประมาณ ${r.years} ปีจากนี้`, 'lm-when');
    add(`ที่ ${r.place}`, 'lm-where');

    // The card's own deck portrait. Empty alt on purpose: every fact in the picture is in the
    // labelled lines right under it, so a screen reader would only hear the card twice.
    const box = el('div');
    box.className = 'lm-portrait';
    const img = el('img');
    img.setAttribute('src', `/art/nuea-khu/${r.card.portrait}`);
    img.setAttribute('alt', '');
    img.setAttribute('width', '400');
    img.setAttribute('height', '400');
    on(img, 'error', () => box.replaceChildren(el('p', 'ยังไม่มีภาพ')));
    box.appendChild(img);
    stage.appendChild(box);

    const rows = el('div');
    rows.className = 'lm-card';
    for (const [label, value] of cardRows(r.card)) {
      const row = el('div');
      row.className = 'lm-row';
      row.appendChild(el('span', label));
      row.appendChild(el('span', value));
      rows.appendChild(row);
    }
    stage.appendChild(rows);
    closing = 'ไม่ต้องรีบออกไปหา แค่จำไว้ว่าประมาณนี้';
  } else {
    const art = el('div');
    art.className = 'lm-art';
    art.innerHTML = SELF_SVG;
    stage.appendChild(art);
    const v = SELF_VARIANTS[r.variant]!;
    add(v.heading, 'lm-heading');
    add(v.body, 'lm-body');
    closing = 'เปิดใหม่ได้เรื่อยๆ ดวงไม่ได้ผูกไว้กับรอบเดียว';
  }
  add(closing, 'lm-note');

  // Back to the ask screen with the answers still held, so the reader can change one or open again
  // with a single tap.
  const again = el('button', 'เปิดใหม่อีกที');
  again.id = 'lm-again';
  again.type = 'button';
  again.className = 'game-btn game-btn-secondary';
  on(again, 'click', () => renderAsk());
  stage.appendChild(again);

  // The press that revealed this screen swaps it in under the same finger; a ghost second contact
  // would land on the redo and skip the reading nobody read yet.
  cleanup.push(armAllButtons(stage));
}

function teardown(): void {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  stageEl?.replaceChildren();
  stageEl = null;
  me = null;
  band = null;
  want = null;
  wantChosen = false;
}

const game: GameModule = {
  id: 'love-match',
  names: { th: 'เนื้อคู่ของคุณ', en: 'Your Soulmate' },
  category: 'fortune',
  // gh#96 / ADR-0040 — a fortune page is one reader and one answer, so [1, 1] and no setup panel.
  players: [1, 1],
  renderer: 'dom',
  // One reader, one answer, no rounds (ADR-0040) — the leave-confirm must never arm on this page.
  startsRound: false,
  keywords: ['เนื้อคู่', 'เนื้อคู่ของคุณ', 'ดูดวงเนื้อคู่', 'เนื้อคู่เป็นคนแบบไหน', 'จะเจอเนื้อคู่ตอนอายุเท่าไร'],
  tagline: 'ตอบสามข้อ แล้วดูว่าเนื้อคู่ของคุณเป็นคนแบบไหน',
  ogTagline: 'ตอบสามข้อ เปิดครั้งเดียว',
  seo: {
    title: 'เนื้อคู่ของคุณ — ตอบสามข้อ รู้ว่าเนื้อคู่เป็นคนแบบไหน และจะเจอตอนอายุเท่าไร',
    description:
      'ดูดวงเนื้อคู่ได้คนเดียว ตอบสามข้อแล้วเปิดครั้งเดียว ได้รายละเอียดว่าเนื้อคู่เป็นคนแบบไหน ทำงานอะไร นิสัยยังไง และจะเจอกันตอนอายุเท่าไรที่ไหน ไม่ต้องโหลดแอป ไม่ต้องสมัคร ไม่เก็บข้อมูลที่กรอก',
    steps: [
      'บอกว่าคุณเป็นผู้ชายหรือผู้หญิง',
      'เลือกช่วงอายุของคุณ',
      'เลือกว่าอยากให้เนื้อคู่เป็นผู้ชายหรือผู้หญิง',
      'กด "เปิดดูเนื้อคู่" ครั้งเดียว แล้วอ่านผล',
    ],
  },
  og: 'love-match.png',
  // gh#82 — the how-to-play prose below the stage is ad inventory, per issue #13's amendment 8:
  // the decision was no slot on the PLAY SCREEN, never no slot on the page.
  ads: true,

  mount(stage: HTMLElement, _ctx: GameContext) {
    stageEl = stage;
    renderAsk();
  },

  dispose() {
    teardown();
  },
};

export default game;
