// gh#288 Phase 0 — built page vs its canvas board, side by side (gh#262 "Not covered": no pixel or crop
// comparison against the boards). Not a pixel diff: boards carry DESIGN NOTES and fixed sample copy,
// so a diff would report every note as a defect. Each pair is the built page and the board rendered at
// the board's own width in the same Chrome, cropped to the first two viewports, laid side by side
// (built LEFT, board RIGHT) and written as one JPEG. Full document heights are recorded too.
// Boards load Google Fonts from the CDN at run time; the built site self-hosts Mitr and Sarabun, so a
// face difference between the halves can be the CDN, not the build (same caveat as gh#262).
//   CDP_PORT=9310 OUT=<dir> node <this file>       (run from the repo root: boards resolve from design/)
import { open } from './cdp-lib.mjs';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const BASE = process.env.BASE || 'http://localhost:4410', OUT = process.env.OUT || '.';
// [id, built path, board file, width, height, mobile, optional state driver]
const PAIRS = [
  ['home-320', '/', 'HomeShelf320', 320, 640, true],
  ['home-1440', '/', 'HomeShelfDesktop', 1440, 900, false],
  ['c-fortune-1440', '/c/fortune/', 'CatFortunePop', 1440, 900, false],
  ['c-party-1440', '/c/party/', 'CatPartyPop', 1440, 900, false],
  ['wheel-390', '/tool/wheel/', 'ToolWheel390', 390, 844, true],
  ['wheel-1440', '/tool/wheel/', 'ToolWheelDesktop', 1440, 900, false],
  ['draw-390', '/tool/draw/', 'ToolDraw390', 390, 844, true],
  ['draw-1440', '/tool/draw/', 'ToolDrawDesktop', 1440, 900, false],
  ['team-390', '/tool/team/', 'ToolTeam390', 390, 844, true],
  ['team-1440', '/tool/team/', 'ToolTeamDesktop', 1440, 900, false],
  ['number-390', '/tool/number/', 'ToolNumber390', 390, 844, true],
  ['number-1440', '/tool/number/', 'ToolNumberDesktop', 1440, 900, false],
  ['404-320', '/404.html', 'NotFound320', 320, 640, true],
  ['404-1440', '/404.html', 'NotFoundDesktop', 1440, 900, false],
  ['siamsi-390', '/game/siamsi/', 'SiamsiIntent', 390, 844, true],
  ['daily-fortune-390', '/game/daily-fortune/', 'DuangTodayIdle', 390, 844, true],
  ['love-match-390', '/game/love-match/', 'SoulmateStart', 390, 844, true],
];
const s = await open();
const heights = {};
async function capture(url, w, h, mobile, file) {
  await s.setWidth(w, h, mobile);
  await s.nav(url);
  // Wipe storage ON the origin, then reload (a wipe from about:blank clears nothing: browser-verification trap 4).
  if (url.startsWith('http')) { await s.ev(`localStorage.clear(); sessionStorage.clear(); return 1`); await s.nav(url); }
  await s.sleep(1200);
  const docH = await s.ev(`await document.fonts.ready; return document.documentElement.scrollHeight`);
  const ch = Math.min(docH, h * 2);
  await s.shot(file, { format: 'jpeg', quality: 70, full: true, clip: { x: 0, y: 0, width: w, height: ch, scale: 1 } });
  return { docH, fonts: await s.ev(`return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '') + ' ' + f.weight).join(', ')`) };
}
for (const [id, path, board, w, h, mobile] of PAIRS) {
  const a = `${OUT}/.tmp-a.jpg`, b = `${OUT}/.tmp-b.jpg`;
  const built = await capture(BASE + path, w, h, mobile, a);
  const canvas = await capture(pathToFileURL(`design/${board}.dc.html`).href, w, h, mobile, b);
  heights[id] = { built: built.docH, board: canvas.docH, boardFile: `design/${board}.dc.html`, builtFonts: built.fonts, boardFonts: canvas.fonts };
  const col = w <= 400 ? w : 720; // desktop pairs scaled to half width
  const img = async (p) => `data:image/jpeg;base64,${(await readFile(p)).toString('base64')}`;
  const html = `<body style="margin:0;background:#777;display:flex;gap:8px;align-items:flex-start;font:12px monospace;color:#fff"><figure style="margin:0;width:${col}px"><figcaption>BUILT ${path} @${w}</figcaption><img style="width:${col}px;display:block" src="${await img(a)}"></figure><figure style="margin:0;width:${col}px"><figcaption>BOARD ${board} @${w}</figcaption><img style="width:${col}px;display:block" src="${await img(b)}"></figure></body>`;
  await s.setWidth(col * 2 + 8, 400, false);
  await s.nav('about:blank');
  await s.send('Page.setDocumentContent', { frameId: (await s.send('Page.getFrameTree')).result.frameTree.frame.id, html });
  await s.sleep(400);
  const sh = await s.ev(`return document.body.scrollHeight`);
  await s.setWidth(col * 2 + 8, Math.min(sh, 4000), false); await s.sleep(200);
  await s.shot(`${OUT}/pair-${id}.jpg`, { format: 'jpeg', quality: 62 });
  await unlink(a); await unlink(b);
}
await s.close();
await writeFile(`${OUT}/heights.json`, JSON.stringify(heights, null, 1));
console.log(JSON.stringify(heights, null, 1));
process.exit(0);
