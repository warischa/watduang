import { connect, SNAP } from './lib.mjs';
const W = +process.argv[2], H = +process.argv[3], dir = process.argv[4];
const s = await connect(); const out = {};
const K = "watduang:timebomb-players";
const st = () => s.ev(`return {roster:localStorage.getItem('watduang:roster'),group:localStorage.getItem('watduang:group'),legacy:localStorage.getItem('${K}')}`);
const slim = (x) => ({ mode: x.count !== null ? 'first' : 'saved', rows: x.rows.map((r) => `${r.n}|${r.tick}`), limit: x.limit });
await s.view(W, H);
const mascots = ['แมวส้ม', 'ชิบะ', 'บันนี่', 'ฟร็อกกี้', 'หมีทอง', 'แพนด้า', 'เพนกวิน', 'ลูกเจี๊ยบ', 'หมูอ้วน', 'สไลม์ดาว', 'โคอาล่า', 'จิ้งจอก', 'กระรอก', 'นากน้อย', 'สิงโต', 'กวางน้อย', 'แฮมสเตอร์', 'แรคคูน', 'แมวน้ำ', 'มังกรน้อย'];
async function seed(obj) {
  await s.nav('/game/timebomb/play/'); await s.wipe();
  for (const [k, v] of Object.entries(obj)) await s.ev(`localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)}); return 1`);
}
// Case A: empty roster + legacy (count 3, typed names 1 and 3; the rest default mascots as the old file wrote them)
const names = [...mascots]; names[0] = 'พี่ต้น'; names[2] = 'น้องมิ้นท์';
await seed({ [K]: JSON.stringify({ count: 3, names }) });
out.A_seeded = await st();
await s.nav('/game/timebomb/play/'); await s.sleep(800);
out.A_after = await st(); out.A_screen = slim(await s.ev(SNAP));
await s.shot(`${dir}/tb-migrated-${W}.png`);
// Case B: roster non-empty + legacy
await seed({ 'watduang:roster': JSON.stringify(['ก', 'ข']), [K]: JSON.stringify({ count: 4, names }) });
out.B_seeded = await st();
await s.nav('/game/timebomb/play/'); await s.sleep(800);
out.B_after = await st(); out.B_screen = slim(await s.ev(SNAP));
// Case C: empty roster + corrupt legacy
await seed({ [K]: '{not json' });
await s.nav('/game/timebomb/play/'); await s.sleep(800);
out.C_after = await st(); out.C_screen = slim(await s.ev(SNAP));
// Case D: legacy 'count' > names typed; names array shorter than count, blank entries
await seed({ [K]: JSON.stringify({ count: 4, names: ['', 'x'] }) });
await s.nav('/game/timebomb/play/'); await s.sleep(800);
out.D_after = await st(); out.D_screen = slim(await s.ev(SNAP));
// Case E: unconverted route legacy key must NOT be touched: dice-loser key
out.errors = s.errors;
console.log(JSON.stringify(out)); await s.close();
