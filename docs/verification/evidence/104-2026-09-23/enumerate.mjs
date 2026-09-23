#!/usr/bin/env node
// gh#104 box 2 - enumerate every reader-visible string on the fortune (ดูดวง) surfaces and classify
// each against three conditions: gather a group / pass a phone / read aloud to another person.
// READ-ONLY: writes nothing, builds nothing, mutates nothing.
//
// 2026-09-23 refresh of the 2026-09-09 instrument, which lives outside the repo at
// ~/.claude/projects/-Users-waris-c-claude-free-game/gh104-enumerate.mjs. This copy runs on the
// tree after gh#97/gh#98 rebuilt the siamsi deck into SLIPS and gh#104 item 2 regenerated the OG
// cards. Adapted only where the tree broke it - the 09-09 original and its report stay the record.
//
//   node docs/verification/evidence/104-2026-09-23/enumerate.mjs
//   node docs/verification/evidence/104-2026-09-23/enumerate.mjs --rows      # + one TSV line per examined string
//   node docs/verification/evidence/104-2026-09-23/enumerate.mjs --flagged   # + one TSV line per flagged string
//   node docs/verification/evidence/104-2026-09-23/enumerate.mjs --extra     # borderline + game-noun hits
//
// Set derivation is not a hand list: the fortune games come from filtering the RUNTIME manifest
// (src/games/manifest.ts, `games`) on category === 'fortune'; the category surface is the runtime
// `categories.fortune` record; the shared templates are the ones those routes actually render.
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const ROOT = '/Users/waris.c/claude/free-game';
const require = createRequire(path.join(ROOT, 'package.json'));
const ts = require('typescript');
const THAI = /[฀-๿]/;

// ------------------------------------------------------------------ classifier
// Trap 1 - the daung trap: the Thai word for "fortune" (ดวง) contains the substring for "circle of
// friends" (วง), and so do ~20 unrelated syllables (ช่วง ม่วง ร่วง ...). A bare match on that
// substring flags every fortune string on the site. Two defences, both needed:
//   (a) a stoplist blanks the common non-group syllables;
//   (b) the group pattern itself only accepts วง at a token start or in a known group context,
//       so an unlisted word (ท้วง, พ่วง, a new one) cannot leak through.
// Trap 1b - a stoplist entry can eat a group context: ห้วง (an abyss) is a substring of ให้วง
// ("to the circle"), so listing it blanked the very phrase the group rule looks for. It is out.
// Trap 2 - substring inside a longer word: "มือถือเครื่องเดียว" (one phone) contains "ถือเครื่อง"
// (hold the phone). The phone pattern uses a negative lookbehind for มือ.
// Trap 3 - negation: "ไม่มีใครโดน" (nobody gets picked) is the OPPOSITE of the condition; a negated
// clause is blanked before matching, or the fortune หมวด's own honest copy reads as a violation.
const STOPLIST = /ดูดวง|ดวง|ช่วง|ห่วง|บ่วง|ล่วง|ร่วง|ม่วง|พ่วง|ถ่วง|หน่วง|ด้วง|ทรวง|ปวง|บวงสรวง|ทวง|ท้วง|หวง|ควง|พวง|ลวง|สรวง|วงล้อ|วงกลม|วงเงิน|วงการ|วงจร/g;
const NEGATION = /ไม่มีใคร[^\s]{0,12}|ไม่ต้อง[^\s]{0,14}|ไม่มี[^\s]{0,12}|ไม่ใช่[^\s]{0,12}/g;

// วง accepted only at a token start or in an explicit group context - never as a bare substring.
const WONG = /(?:^|[\s(·])วง|ในวง|ทั้งวง|ให้วง|บอกวง|กับวง|ชวนวง|ของวง|ด้วยวง|ต่อวง|รอบวง|เข้าวง|ทางวง|คนวง|วงเพื่อน|วงฟัง|วงเดิม|วงเดียวกัน|วงโหวต|สำหรับวง/;

const PATTERNS = {
  group: [
    ['วง (token-initial or group context)', WONG],
    ['ทุกคน', /ทุกคน/],
    ['คนอื่น', /คนอื่น/],
    ['คนข้างๆ', /คนข้าง\s*ๆ?/],
    ['คนทางซ้าย/ขวา', /คนทาง(ซ้าย|ขวา)|(ซ้าย|ขวา)มือ/],
    ['เพื่อน', /เพื่อน/],
    ['คนรอบตัว', /คนรอบตัว|รอบวง/],
    ['ผู้เล่น/คนเล่น', /ผู้เล่น|คนเล่น/],
    ['จำนวนคน', /\d+\s*[-–]\s*\d+\s*คน|กี่คน|หลายคน|\d+\s*คนขึ้นไป/],
    ['ปาร์ตี้/สังสรรค์', /ปาร์ตี้|สังสรรค์|ก๊วน/],
    ['ช่วยกัน/ด้วยกัน', /ช่วยกัน|ด้วยกัน|กันเอง|แข่งกัน|ทายกัน/],
    // Added 2026-09-23 on a REFUTE review: imperatives that recruit a person passed clean because
    // the group vocabulary had no term for inviting. ชวน (invite), ใครสักคน (someone) and คนใกล้ตัว
    // (someone close) are the recruit register the rebuilt deck actually uses.
    ['ชวน/ใครสักคน/คนใกล้ตัว (recruit a person)', /ชวน|ใครสักคน|คนใกล้ตัว/],
    ['ใครโดน/ใครจ่าย', /คนโดน|ใครโดน|คนแพ้|ใครแพ้|คนจ่าย|ใครจ่าย|ใครไปก่อน|ใครเริ่ม/],
  ],
  phone: [
    ['ส่งเครื่อง/ส่งมือถือ/ส่งต่อ', /ส่ง(เครื่อง|มือถือ|ต่อ)/],
    ['วนกัน/ผลัดกัน', /วนกัน|ผลัดกัน|เวียนกัน/],
    ['ถือเครื่อง/ยื่นเครื่อง', /(?<!มือ)ถือเครื่อง|ยื่น(เครื่อง|มือถือ)/],
  ],
  aloud: [
    ['ให้…ฟัง/อ่านให้', /ให้[^\s]{0,12}ฟัง|อ่านให้|ฟังหน่อย/],
    ['บอกวง/บอกให้', /บอก(วง|ทุกคน|เพื่อน|ให้)/],
    ['บอก… (imperative opener, addressee dropped)', /^บอก/],
    ['พูด/เล่า/ประกาศ/เอ่ยชื่อ', /พูด|เล่า|ประกาศ|เอ่ยชื่อ|ตะโกน/],
    ['ให้…ทาย/เดา/โหวต', /ให้[^\s]{0,12}(ทาย|เดา|โหวต)|ช่วยกันเดา/],
    ['ชี้คน/ชมคน', /ชี้คน|ชมคน|ชม[^\s]{0,6}(มือ|คน)/],
    ['ขอบคุณคน', /ขอบคุณ(คน|เพื่อน)/],
  ],
};

// Not one of the three conditions, but the owner may still want to look: a claim that implies a
// shared device without instructing anyone to pass it. Counted and reported separately from M.
const BORDERLINE = [
  ['เครื่องเดียว (one shared phone - implies sharing, instructs nothing)', /เครื่องเดียว/],
];
// Box 5 of the ticket, reported separately and NOT counted in M: a fortune surface calling itself เกม.
const GAME_NOUN = /เกม/;

// The query the 2026-09-08 comment ran: bare substrings, no stoplist, no negation, no context rule.
const NAIVE = /วง|ทุกคน|คนทางซ้าย|คนทางขวา|เพื่อน|คนข้างๆ|ให้คนอื่น/;

function classify(s, { naive = false } = {}) {
  if (naive) return NAIVE.test(s) ? { group: ['naive substring'] } : {};
  const probe = s.replace(NEGATION, '·').replace(STOPLIST, '·');
  const hits = {};
  for (const [cond, pats] of Object.entries(PATTERNS)) {
    const terms = pats.filter(([, re]) => re.test(probe)).map(([n]) => n);
    if (terms.length) hits[cond] = terms;
  }
  return hits;
}
function borderline(s) {
  const probe = s.replace(NEGATION, '·');
  return BORDERLINE.filter(([, re]) => re.test(probe)).map(([n]) => n);
}
const isFlagged = (h) => Object.keys(h).length > 0;

// ------------------------------------------------------------------ collection
// tier A = copy the ดูดวง หมวด owns · tier B = shared template text that RENDERS on a ดูดวง route
// tier C = checked and excluded (never reaches a ดูดวง reader) - reported, not counted in N/M
const rows = [];
const seen = new Set();
function add(tier, surface, symbol, value, layer, slot = 'copy') {
  const v = String(value).trim();
  if (!v || !THAI.test(v)) return;
  const key = tier + '|' + surface + '|' + symbol + '|' + v;
  if (seen.has(key)) return;
  seen.add(key);
  rows.push({ tier, surface, symbol, value: v, layer, slot });
}

// Per-string render verdicts resolved by reading the enclosing condition in the template.
const RENDER = {
  'เล่นเกมต่อด้วยวงเดิม': ['no', 'GameLayout hands this to GameNav only when categories[game.category].carriesGroup is true; fortune declares carriesGroup: false'],
  'ส่งมือถือให้คนถัดไป': ['dom-hidden', 'PassPhone.astro is rendered unconditionally by GameLayout with the hidden attribute; no fortune module ever opens it'],
  'วง 6 คน': ['dom-hidden', 'GameLayout roster-count pill ships with hidden; [id].astro seeds it only when stage.dataset.players !== "1,1"'],
  'วง': ['unreachable', '[id].astro showRosterCount() template head; the seed call is guarded by if (!isSolo), and the only other caller is the watduang:start handler whose single dispatcher (PlayerSetup.astro requestStart) never mounts on a [1, 1] fortune page'],
  'คน': ['unreachable', 'the tail of the same template literal'],
};
const renderOf = (v) => RENDER[v] ?? ['yes', ''];

// -- Layer 1: runtime import of both manifests ---------------------------------
const manifest = await import(path.join(ROOT, 'src/games/manifest.ts'));
const catmod = await import(path.join(ROOT, 'src/games/categories.ts'));
const fortuneGames = manifest.games.filter((g) => g.category === 'fortune');
const catMeta = catmod.categories.fortune;
for (const [k, v] of Object.entries(catMeta)) {
  if (typeof v === 'string') add('A', 'category manifest (renders on /c/fortune/ and the home hub)', `categories.fortune.${k}`, v, 'runtime');
  else if (k === 'seo') for (const [sk, sv] of Object.entries(v)) add('A', 'category manifest <head> (/c/fortune/)', `categories.fortune.seo.${sk}`, sv, 'runtime', 'meta');
}

// -- Layer 2: runtime metadata of every fortune GameModule ---------------------
for (const g of fortuneGames) {
  add('A', `/game/${g.id}/ page metadata`, `${g.id}.names.th`, g.names.th, 'runtime');
  add('A', `/game/${g.id}/ page metadata`, `${g.id}.tagline`, g.tagline, 'runtime', 'og-text');
  add('A', `/game/${g.id}/ <head>`, `${g.id}.seo.title`, g.seo.title, 'runtime', 'meta');
  add('A', `/game/${g.id}/ <head>`, `${g.id}.seo.description`, g.seo.description, 'runtime', 'meta');
  g.seo.steps.forEach((s, i) => add('A', `/game/${g.id}/ how-to-play + HowTo JSON-LD`, `${g.id}.seo.steps[${i}]`, s, 'runtime'));
  g.keywords.forEach((k, i) => add('A', `/game/${g.id}/ <head>`, `${g.id}.keywords[${i}]`, k, 'runtime', 'meta'));
}

// -- Layer 3: every exported RUNTIME value of every fortune module -------------
// Deep-walks the module namespace, so a deck assembled at import time is enumerated as the strings
// it actually holds rather than as the literals a text grep can see.
function walkValue(v, p, out, d = 0) {
  if (d > 6) return;
  if (typeof v === 'string') { out.push([p, v]); return; }
  if (Array.isArray(v)) { v.forEach((e, i) => walkValue(e, `${p}[${i}]`, out, d + 1)); return; }
  if (v && typeof v === 'object') for (const [k, e] of Object.entries(v)) walkValue(e, `${p}.${k}`, out, d + 1);
}
// Slot taxonomy by walk path. The 09-09 deck had one instruction field (.prompt) and one
// prediction field (FORTUNES[].text); the rebuilt decks keep the split under new names - SLIPS
// (verse/readings/closing predict, nothing instructs) and POOLS[].lines[].text.
const slotOf = (p) => (/\.prompt$/.test(p) ? 'directive' : /(FORTUNES|SLIPS|POOLS)/.test(p) ? 'prediction' : 'copy');
const runtimeCaptured = new Map();
for (const g of fortuneGames) runtimeCaptured.set(g.id, new Set(rows.filter((r) => r.symbol.startsWith(g.id + '.')).map((r) => r.value)));
for (const g of fortuneGames) {
  const ns = await import(path.join(ROOT, `src/games/${g.id}.ts`));
  const out = [];
  for (const [name, val] of Object.entries(ns)) {
    if (name === 'default' || typeof val === 'function') continue;
    walkValue(val, name, out);
  }
  const set = runtimeCaptured.get(g.id);
  for (const [p, v] of out) {
    if (!THAI.test(v)) continue;
    set.add(v.trim());
    add('A', `/game/${g.id}/ deck + exported UI copy`, `${g.id}.ts -> ${p}`, v, 'runtime', slotOf(p));
  }
  // gh#98 moved the siamsi deck and its reading-row labels into a data module the game module
  // RE-EXPORTS: the namespace walk above sees the deck through the re-export, but the labels the
  // deck module exports on its own (the chips and row labels a reader sees) are not in the game
  // module's namespace and would silently leave N. Walk every module the game re-exports from,
  // deduped against the values the game's own namespace already yielded.
  const gsrc = fs.readFileSync(path.join(ROOT, `src/games/${g.id}.ts`), 'utf8');
  for (const m of gsrc.matchAll(/export\s+(?:\{[^}]*\}|\*)\s+from\s+'(\.[^']+)'/g)) {
    const dns = await import(path.join(ROOT, 'src/games', m[1]));
    const dout = [];
    for (const [name, val] of Object.entries(dns)) {
      if (name === 'default' || typeof val === 'function') continue;
      walkValue(val, name, dout);
    }
    for (const [p, v] of dout) {
      if (!THAI.test(v) || set.has(v.trim())) continue;
      set.add(v.trim());
      add('A', `/game/${g.id}/ deck + exported UI copy`, `${g.id}.ts re-export ${path.basename(m[1])} -> ${p}`, v, 'runtime', slotOf(p));
    }
  }
}

// -- shared TS literal extractor ------------------------------------------------
function enclosing(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isFunctionDeclaration(n) && n.name) return `${n.name.text}()`;
    if (ts.isVariableDeclaration(n) && n.name) return String(n.name.getText());
  }
  return '(module scope)';
}
function tsLiterals(code, name) {
  const sf = ts.createSourceFile(name, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found = [];
  (function walk(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
        || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      if (THAI.test(node.text)) found.push([node.text, enclosing(node)]);
    }
    ts.forEachChild(node, walk);
  })(sf);
  return found;
}

// -- Layer 4: static-read of in-function literals in the fortune modules -------
for (const g of fortuneGames) {
  const file = path.join(ROOT, `src/games/${g.id}.ts`);
  for (const [lit, where] of tsLiterals(fs.readFileSync(file, 'utf8'), `${g.id}.ts`)) {
    if (runtimeCaptured.get(g.id).has(lit.trim())) continue;
    add('A', `/game/${g.id}/ in-module UI literal`, `${g.id}.ts -> ${where}`, lit, 'static-read');
  }
}

// -- Layer 5: static-read of the .astro templates a fortune route renders ------
// Comments are excluded, not assumed absent: scripts/thai-comments.mjs ALLOWS a quoted Thai term
// inside a comment, and these files use that. Frontmatter and <script> go through the TS AST
// (literals only); the markup has <!-- --> and {/* */} removed before extraction.
const SEG = /[^\n<>{}"'`]*[฀-๿][^\n<>{}"'`]*/g;
function astroStrings(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const out = [];
  let body = text;
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) { for (const [l, w] of tsLiterals(fm[1], rel)) out.push([l, `frontmatter ${w}`]); body = text.slice(fm[0].length); }
  body = body.replace(/<script[^>]*>([\s\S]*?)<\/script>/g, (_m, code) => {
    for (const [l, w] of tsLiterals(code, rel)) out.push([l, `<script> ${w}`]);
    return '';
  });
  body = body.replace(/<!--[\s\S]*?-->/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  for (const line of body.split('\n')) for (const m of line.match(SEG) || []) {
    const v = m.trim(); if (v && THAI.test(v)) out.push([v, 'markup']);
  }
  return out;
}
const TEMPLATES = [
  ['B', '/c/fortune/ template', 'src/pages/c/[category].astro'],
  ['B', '/game/<fortune>/ template + page script', 'src/pages/game/[id].astro'],
  ['B', '/game/<fortune>/ layout', 'src/layouts/GameLayout.astro'],
  ['B', '/game/<fortune>/ leave confirm', 'src/shell/LeaveConfirm.astro'],
  ['B', '/game/<fortune>/ pass-phone panel', 'src/shell/PassPhone.astro'],
  ['B', 'game nav (both fortune pages)', 'src/components/GameNav.astro'],
  // PageChrome is mounted by [category].astro and index.astro only - GameLayout.astro never mounts
  // it and passes no `chrome` to Base, so game pages get Base's brand-only footer. Corrected
  // 2026-09-23 on a REFUTE review: the old label claimed all three fortune surfaces.
  ['B', 'page chrome (/c/fortune/ listing page; not mounted on the game pages)', 'src/components/PageChrome.astro'],
  ['B', '<head>/footer shell (all three)', 'src/layouts/Base.astro'],
  ['B', 'home hub card + section component', 'src/components/landing/Card.astro'],
  ['B', 'home hub card + section component', 'src/components/landing/Section.astro'],
  ['C', 'setup panel - party-only, never rendered on a [1, 1] fortune page', 'src/shell/PlayerSetup.astro'],
  ['C', 'home hub site-wide chrome - describes all three groups, not the ดูดวง หมวด', 'src/pages/index.astro'],
];
for (const [tier, surface, rel] of TEMPLATES) {
  if (!fs.existsSync(path.join(ROOT, rel))) { console.error(`MISSING TEMPLATE ${rel}`); process.exitCode = 1; continue; }
  for (const [v, where] of astroStrings(rel)) add(tier, surface, `${path.basename(rel)} -> ${where}`, v, 'static-read');
}

// -- Layer 6: the OG card text a fortune surface actually shares -----------------
// Pixels, not markup: the generator bakes these strings into public/og/*.png at generation time,
// so no page-source query can see them. On 2026-09-09 the text was scraped out of make-og.mjs with
// pinned regexes; the generator has since moved the ordered LOGICAL lines into
// scripts/og-card-text.mjs (cardLines), which both the generator and scripts/og-card-check.mjs
// import. Calling cardLines IS what the 09-09 scrape approximated, so this layer now calls it -
// and pins, with one regex each, that make-og.mjs still takes its text from that module: if the
// text ever moves back into the renderer, layer 6 is blind again and must fail loudly.
const mkSrc = fs.readFileSync(path.join(ROOT, 'scripts/make-og.mjs'), 'utf8');
if (!/import \{ SITE, cardLines \} from '\.\/og-card-text\.mjs'/.test(mkSrc) || !/lines = cardLines\(game\)/.test(mkSrc)) {
  console.error('make-og.mjs no longer takes its card text from og-card-text.mjs - layer 6 is BLIND, fix before trusting N');
  process.exitCode = 1;
} else {
  const ogText = await import(path.join(ROOT, 'scripts/og-card-text.mjs'));
  for (const g of fortuneGames) {
    ogText.cardLines(g).forEach((line, i) =>
      add('A', `/game/${g.id}/ OG card text (public/og/${g.og}, baked by scripts/make-og.mjs)`, `og-card-text.mjs -> cardLines(${g.id}) line ${i + 1}`, line, 'og-generator', 'og-text'));
  }
  // /c/fortune/ passes no ogImage, so Base.astro's default '/og/site.png' is its share card.
  ogText.cardLines(ogText.SITE).forEach((line, i) =>
    add('B', '/c/fortune/ OG card text (public/og/site.png, Base.astro default ogImage)', `og-card-text.mjs -> cardLines(SITE) line ${i + 1}`, line, 'og-generator', 'og-text'));
}

// -- Layer 7: what the game nav prints on a fortune page -------------------------
// GameNav.astro holds no Thai literal - it renders manifest fields. A fortune page passes no
// `category` (carriesGroup is false), so the WIDE list runs: one labelled group per category, each
// item being a game's names.th. That puts every สุ่มคนโดน game's name on both ดูดวง pages.
for (const [slug, meta] of Object.entries(catmod.categories)) {
  add('B', 'game nav on a fortune page (wide list)', `GameNav.astro -> categories.${slug}.label`, meta.label, 'runtime');
  for (const g of manifest.games.filter((x) => x.category === slug)) {
    add('B', 'game nav on a fortune page (wide list)', `GameNav.astro -> ${g.id}.names.th`, g.names.th, 'runtime');
  }
}

// -- Layer 8: the OG pixels actually on disk -------------------------------------
// TRANSCRIBED BY EYE from the three PNGs on 2026-09-23 - no query can read pixels. Each card is
// pinned by sha256: if a hash no longer matches, the transcription is void and the images must be
// re-opened. This layer exists because the generator's OUTPUT and the shipped file can disagree;
// on this tree they no longer do (gh#104 item 2 regenerated all three), which is itself a finding.
// Cards carry two Thai logical lines each: the title, then the tagline, which the renderer WRAPS
// across visual lines (two on siamsi, three on daily-fortune); each logical line below is the
// visual lines joined at their wrap points, and both reproduce the manifest/generator tagline
// byte for byte - that join is the transcription's own cross-check. The 'watduang.com' footer is
// Latin and the Thai filter of this query excludes it.
const OG_PIXELS = [
  ['site.png', '249b434390f345a8e81078576fde7ace68c659b3d5915eaa6874852b02ea7137', '/c/fortune/ OG card AS SHIPPED (public/og/site.png)',
    ['วัดดวง', 'ไม่ต้องโหลดแอป ไม่ต้องสมัคร']],
  ['siamsi.png', 'e801f9ba93db121044d9cedbb8838755eecf2539d9dc45baf5e89886cc5e2b96', '/game/siamsi/ OG card AS SHIPPED (public/og/siamsi.png)',
    ['เสี่ยงเซียมซี', 'เขย่ามือถือเสี่ยงเซียมซี เปิดดูใบทำนายของคุณ']],
  ['daily-fortune.png', 'e0cef425c735d338558b9717b40434b60ce21251e4daaa48c6a115dfc5dab140', '/game/daily-fortune/ OG card AS SHIPPED (public/og/daily-fortune.png)',
    ['ดวงวันนี้', 'กดครั้งเดียว รู้เลยว่าวันนี้จะเจอเรื่องจิ๊บจ๊อยอะไร อ่านขำๆ ไม่ต้องเชื่อ']],
];
const { createHash } = await import('node:crypto');
for (const [file, sha, surface, lines] of OG_PIXELS) {
  const actual = createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'public/og', file))).digest('hex');
  if (actual !== sha) {
    console.error(`public/og/${file} changed since the 2026-09-09 transcription (sha256 ${actual}) - re-open the image, this layer is VOID`);
    process.exitCode = 1;
    continue;
  }
  lines.forEach((l, i) => add(file === 'site.png' ? 'B' : 'A', surface, `public/og/${file} line ${i + 1} (read from pixels, sha256-pinned)`, l, 'pixel-read', 'og-text'));
}

// ------------------------------------------------------------------ calibration
const siamsi = await import(path.join(ROOT, 'src/games/siamsi.ts'));
// The 09-09 deck fixtures pointed at FORTUNES[].prompt; that deck is gone (gh#97/gh#98 rebuilt it
// into SLIPS, which carries no instruction field at all). The two legs are repointed at real SLIPS
// strings playing the same roles: a solo line, and a line that trips group+aloud while carrying
// ช่วง in its tail - the stoplist must blank ช่วง and still flag คนรอบตัว.
const CAL = [
  ['clean       / categories.fortune.hubBody', catMeta.hubBody, false, {}],
  ['clean       / categories.fortune.intro', catMeta.intro, false, {}],
  ['clean       / siamsi SLIPS[0].verse[0] (a solo line: the sky, nobody in the room)', siamsi.SLIPS[0].verse[0], false, {}],
  ['group+aloud / siamsi SLIPS[0].readings.love (คนรอบตัว + พูด, ช่วง in the tail stays blanked)', siamsi.SLIPS[0].readings.love, true, { group: 1, aloud: 1 }],
  ['group       / categories.party.intro (external positive control)', catmod.categories.party.intro, true, { group: 1 }],
  ['phone       / the retired 2026-08-28 fortune intro clause', 'ส่งเครื่องวนกันในวง', true, { phone: 1, group: 1 }],
];
let calOk = true;
const calLines = [];
for (const [name, s, expectFlag, expectConds] of CAL) {
  const h = classify(s);
  const ok = isFlagged(h) === expectFlag && Object.keys(expectConds).every((c) => h[c]);
  calOk = calOk && ok;
  calLines.push(`  ${ok ? 'PASS' : 'FAIL'}  ${name} -> flagged=${isFlagged(h)} ${JSON.stringify(h)}`);
}
// must-red: the two clean fortune strings MUST flag under the naive query, or "clean" proves nothing.
const redA = isFlagged(classify(catMeta.hubBody, { naive: true }));
const redB = isFlagged(classify(catMeta.intro, { naive: true }));
calOk = calOk && redA && redB;
calLines.push(`  ${redA ? 'PASS' : 'FAIL'}  must-red A: categories.fortune.hubBody under the NAIVE query -> flagged=${redA} (a detector that never fires on this input would prove nothing)`);
calLines.push(`  ${redB ? 'PASS' : 'FAIL'}  must-red B: categories.fortune.intro under the NAIVE query -> flagged=${redB}`);
const bl = borderline(catMeta.intro).length > 0;
calLines.push(`  ${bl ? 'PASS' : 'FAIL'}  borderline control: categories.fortune.intro carries ${JSON.stringify(borderline(catMeta.intro))} - reported, not counted in M`);
calOk = calOk && bl;

// 2026-09-23 seams, both exercised on in-memory SLIPS-shaped fixtures: the walker that enumerates
// the deck, and the stoplist on the deck's own syllable trap. อ่านให้วงฟัง (read to the circle) is
// the phrase a ห้วง-style stoplist entry would swallow - the 09-09 trap 1b, re-run on the new deck
// shape; ในช่วงนี้ (during this period) is ช่วง, which the stoplist must blank.
const slipFixture = (text, field) => ({
  number: 99,
  grade: '',
  verse: [field === 'verse' ? text : '', '', '', ''],
  readings: { work: '', money: '', love: field === 'love' ? text : '', health: field === 'health' ? text : '' },
  closing: '',
});
const walkedOf = (slip) => {
  const out = [];
  walkValue(slip, 'SLIPS[fixture]', out);
  return out.map(([, v]) => v.trim()).filter(Boolean);
};
const fxGroup = walkedOf(slipFixture('อ่านให้วงฟัง', 'verse'));
const hxGroup = fxGroup.map((s) => classify(s));
const okFxG = fxGroup.length === 1 && isFlagged(hxGroup[0]) && !!hxGroup[0].group && !!hxGroup[0].aloud;
calOk = calOk && okFxG;
calLines.push(`  ${okFxG ? 'PASS' : 'FAIL'}  must-red C / SLIPS-shaped fixture carrying อ่านให้วงฟัง through the walker -> flagged=${isFlagged(hxGroup[0] || {})} ${JSON.stringify(hxGroup[0] || {})} (ให้วง survives the stoplist: trap 1b on the deck shape)`);
const fxClean = walkedOf(slipFixture('ในช่วงนี้', 'love'));
const hxClean = fxClean.map((s) => classify(s));
const naFxC = fxClean.some((s) => isFlagged(classify(s, { naive: true })));
const okFxC = fxClean.length === 1 && !isFlagged(hxClean[0]) && naFxC;
calOk = calOk && okFxC;
calLines.push(`  ${okFxC ? 'PASS' : 'FAIL'}  clean D / SLIPS-shaped fixture carrying ในช่วงนี้ through the walker -> flagged=${isFlagged(hxClean[0] || {})} ${JSON.stringify(hxClean[0] || {})}, naive=${naFxC} (ช่วง blanked; the naive query still fires, so clean is a verdict, not silence)`);
// Added 2026-09-23 on a REFUTE review: the recruit register (ชวน / ใครสักคน / คนใกล้ตัว) was absent
// from the group vocabulary, so imperatives that tell the reader to fetch a person passed clean.
// This leg is the counter-example, carried through the same walker the deck is enumerated by.
const fxRecruit = walkedOf(slipFixture('ชวนใครสักคนไปเดินด้วย', 'health'));
const hxRecruit = fxRecruit.map((s) => classify(s));
const okFxR = fxRecruit.length === 1 && isFlagged(hxRecruit[0]) && !!hxRecruit[0].group;
calOk = calOk && okFxR;
calLines.push(`  ${okFxR ? 'PASS' : 'FAIL'}  must-red E / SLIPS-shaped fixture carrying ชวนใครสักคนไปเดินด้วย through the walker -> flagged=${isFlagged(hxRecruit[0] || {})} ${JSON.stringify(hxRecruit[0] || {})} (recruit-a-person imperative: the vocabulary gap the REFUTE review found)`);
// Walker seam: one in-memory slip must yield exactly its ten string fields - the grade, the four
// verse lines, the four readings and the closing line - in deck order. A walker that skipped
// .readings or .closing would enumerate a deck it only half read.
const seam = [];
walkValue({ number: 1, grade: 'ดี', verse: ['v1', 'v2', 'v3', 'v4'], readings: { work: 'w', money: 'm', love: 'l', health: 'h' }, closing: 'c' }, 'SLIPS[seam]', seam);
const okSeam = seam.length === 10 && seam.map(([, v]) => v).join('|') === 'ดี|v1|v2|v3|v4|w|m|l|h|c';
calOk = calOk && okSeam;
calLines.push(`  ${okSeam ? 'PASS' : 'FAIL'}  walker seam / an in-memory slip yields all ten string fields in deck order -> ${seam.length} strings`);

// ------------------------------------------------------------------ verdict
for (const r of rows) { r.hits = classify(r.value); r.bl = borderline(r.value); r.gameNoun = GAME_NOUN.test(r.value); [r.renders, r.why] = renderOf(r.value); }
const scoped = rows.filter((r) => r.tier !== 'C');
const flagged = scoped.filter((r) => isFlagged(r.hits));
const excluded = rows.filter((r) => r.tier === 'C');
const bySurface = new Map();
for (const r of scoped) {
  const e = bySurface.get(r.tier + '  ' + r.surface) || { n: 0, m: 0 };
  e.n++; if (isFlagged(r.hits)) e.m++;
  bySurface.set(r.tier + '  ' + r.surface, e);
}
const unregistered = fs.readdirSync(path.join(ROOT, 'src/games'))
  .filter((f) => f.endsWith('.ts') && !f.startsWith('_') && !['manifest.ts', 'categories.ts', 'types.ts'].includes(f))
  .filter((f) => !manifest.games.some((g) => `${g.id}.ts` === f));

console.log('=== gh#104 box 2 - ดูดวง (fortune) surface enumeration ===');
console.log(`fortune games, runtime manifest filtered on category === 'fortune': ${fortuneGames.map((g) => `${g.id} ${JSON.stringify(g.players)}`).join(' | ')}`);
console.log(`game modules on disk but NOT in the runtime manifest (not shipped, out of scope): ${unregistered.join(', ') || '(none)'}`);
for (const g of fortuneGames) {
  // The 09-09 line asked whether each runtime string exists in the game module's source as a
  // literal. gh#98 moved the siamsi deck into a data module the game re-exports, so the honest
  // question now spans the game module AND every module it re-exports from.
  const gsrc = fs.readFileSync(path.join(ROOT, `src/games/${g.id}.ts`), 'utf8');
  const src = [gsrc, ...[...gsrc.matchAll(/export\s+(?:\{[^}]*\}|\*)\s+from\s+'(\.[^']+)'/g)]
    .map((m) => fs.readFileSync(path.join(ROOT, 'src/games', m[1]), 'utf8'))].join('\n');
  const runtimeVals = rows.filter((r) => r.symbol.startsWith(`${g.id}.ts`) && r.layer === 'runtime').map((r) => r.value);
  const missing = runtimeVals.filter((v) => !src.includes(v));
  console.log(`${g.id}: ${runtimeVals.length} exported runtime strings, ${missing.length} of them absent from the module and its re-exported data modules as a literal${missing.length ? ' -> ' + JSON.stringify(missing.slice(0, 3)) : ''}`);
}
console.log('');
console.log(`EXAMINED (unique Thai-bearing strings reachable on a ดูดวง surface, tiers A+B): ${scoped.length}`);
console.log(`FLAGGED (gather a group / pass a phone / read aloud): ${flagged.length}`);
console.log(`  by condition: group=${flagged.filter((r) => r.hits.group).length} phone=${flagged.filter((r) => r.hits.phone).length} aloud=${flagged.filter((r) => r.hits.aloud).length}`);
console.log(`  by layer: runtime=${flagged.filter((r) => r.layer === 'runtime').length} static-read=${flagged.filter((r) => r.layer === 'static-read').length} og-generator=${flagged.filter((r) => r.layer === 'og-generator').length} pixel-read=${flagged.filter((r) => r.layer === 'pixel-read').length}`);
console.log(`  by slot: directive=${flagged.filter((r) => r.slot === 'directive').length} prediction=${flagged.filter((r) => r.slot === 'prediction').length} meta=${flagged.filter((r) => r.slot === 'meta').length} other=${flagged.filter((r) => !['directive', 'prediction', 'meta'].includes(r.slot)).length}`);
console.log(`  by render verdict: yes=${flagged.filter((r) => r.renders === 'yes').length} dom-hidden=${flagged.filter((r) => r.renders === 'dom-hidden').length} unreachable=${flagged.filter((r) => r.renders === 'unreachable').length} no=${flagged.filter((r) => r.renders === 'no').length}`);
console.log(`BORDERLINE (implies a shared device, instructs nothing - owner call, NOT counted in M): ${scoped.filter((r) => r.bl.length && !isFlagged(r.hits)).length}`);
console.log(`BOX 5 (a fortune surface using the noun เกม - separate rule, NOT counted in M): ${scoped.filter((r) => r.gameNoun).length}`);
console.log('');
console.log('per surface (examined / flagged):');
for (const [s, e] of [...bySurface].sort()) console.log(`  ${String(e.n).padStart(3)} / ${String(e.m).padStart(3)}  ${s}`);
console.log('');
console.log(`tier C, checked and NOT counted: ${excluded.length} strings across ${new Set(excluded.map((r) => r.surface)).size} surfaces; of those, ${excluded.filter((r) => isFlagged(r.hits)).length} would flag if they reached a ดูดวง reader`);
console.log('');
console.log('calibration:');
calLines.forEach((l) => console.log(l));
console.log(`  overall: ${calOk ? 'PASS' : 'FAIL'}`);

const priorRe = /วง|ทุกคน|คนทางซ้าย|คนทางขวา|เพื่อน|คนข้างๆ|ให้คนอื่น/;
// The 2026-09-08 comment's regex ran on the old deck's .prompt and .text; that deck is gone. The
// same comparison over today's deck runs on every prediction field of every slip - the verse
// lines, the four readings and the closing line.
const slipText = (s) => [...s.verse, ...Object.values(s.readings), s.closing];
const deckStrings = siamsi.SLIPS.flatMap(slipText);
const priorD = deckStrings.filter((t) => priorRe.test(t));
const mineD = deckStrings.filter((t) => isFlagged(classify(t)));
console.log('');
console.log(`cross-check against the 2026-09-08 comment (its deck is gone; run on today's SLIPS, ${siamsi.SLIPS.length} slips, ${deckStrings.length} text strings):`);
console.log(`  its regex on slip text: ${priorD.length} | this query on slip text: ${mineD.length}`);
console.log(`  strings only its regex hits, inflated by the daung trap it does not guard: ${priorD.filter((t) => !mineD.includes(t)).length}`);
console.log(`  strings only this query hits, using vocabulary its regex lacks: ${mineD.filter((t) => !priorD.includes(t)).length}`);

if (process.argv.includes('--rows')) {
  console.log('\n--- every examined string (TSV: flag/cond/tier/layer/slot/renders/surface/symbol/value) ---');
  for (const r of rows) console.log([isFlagged(r.hits) ? 'FLAG' : 'ok', Object.keys(r.hits).join('+') || '-', r.tier, r.layer, r.slot, r.renders, r.surface, r.symbol, r.value].join('\t'));
}
if (process.argv.includes('--extra')) {
  console.log('\n--- borderline (TSV: terms/tier/surface/symbol/value) ---');
  for (const r of scoped.filter((x) => x.bl.length && !isFlagged(x.hits))) console.log([r.bl.join(','), r.tier, r.surface, r.symbol, r.value].join('\t'));
  console.log('\n--- เกม noun on a fortune surface, box 5 (TSV: tier/renders/surface/symbol/value) ---');
  for (const r of scoped.filter((x) => x.gameNoun)) console.log([r.tier, r.renders, r.surface, r.symbol, r.value].join('\t'));
}
if (process.argv.includes('--flagged')) {
  console.log('\n--- flagged, tiers A+B (TSV: cond/terms/tier/layer/slot/renders/surface/symbol/value) ---');
  for (const r of flagged) console.log([Object.keys(r.hits).join('+'), Object.values(r.hits).flat().join(','), r.tier, r.layer, r.slot, r.renders, r.surface, r.symbol, r.value].join('\t'));
}
if (!calOk) process.exitCode = 1;
