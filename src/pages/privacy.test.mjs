// node --test — gh#295 B1 (owner picks 2026-11-07, design/Gh295Privacy.dc.html): the privacy page and
// where its link lives. Source and data level, no build or dist involved (the same bargain as
// index.test.mjs and noindex.test.mjs: CI runs these before it builds). The rendered page is the browser
// probe recorded with this ticket's evidence.
//
//   1. The policy text is the owner-approved text, line for line and byte for byte. The approved text is
//      the plain-text file beside the board renders; the data module the page renders is compared to it,
//      never retyped here.
//   2. The page renders that module inside the site chrome, under the board's title, and is indexable.
//   3. Placement A: a link in the home feedback band and one at the end of the feedback page's privacy
//      line. The footer stays brand-only (gh#247), so it carries no anchor at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const APPROVED = join(repoRoot, 'docs', 'verification', 'evidence', 'gh295-boards-2026-11-07', 'privacy-approved-th.txt');
const PAGE = join(here, 'privacy', 'index.astro');
// A missing module reds the tests that need it, one by one, instead of failing this file at import.
const policyModule = await import('../components/privacy-policy.ts').catch(() => ({}));
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const WJ = /⁠/g;

// The approved file: groups separated by blank lines, one rendered line per text line.
const approvedGroups = () =>
  readFileSync(APPROVED, 'utf8')
    .replace(/\n+$/, '')
    .split(/\n\n/)
    .map((g) => g.split('\n'));

test('the policy module is, line for line, the owner-approved text', () => {
  const { POLICY, policyLines } = policyModule;
  assert.ok(POLICY && typeof policyLines === 'function', 'src/components/privacy-policy.ts must export POLICY and policyLines');
  const groups = approvedGroups();
  assert.ok(groups.length >= 3, 'positive control: the approved file parsed into its groups');
  // Group 1 is the h1 and the lead; then one group per section, and the date line closes the last one.
  const mine = [
    [POLICY.title, POLICY.lead],
    ...POLICY.sections.map((s) => [s.heading, ...s.blocks.flatMap((b) => (b.kind === 'ul' ? b.items : [b.text]))]),
  ];
  mine[mine.length - 1].push(POLICY.updated);
  assert.deepEqual(mine, groups);
  // The flat reader the probe and the page share must say the same thing.
  assert.deepEqual(policyLines(), groups.flat());
  for (const line of policyLines()) assert.doesNotMatch(line, WJ, 'the data holds the visible text only; joiners are added at render');
});

test('the list lines are the three the board draws as a list', () => {
  const { POLICY } = policyModule;
  assert.ok(POLICY, 'the policy module must load');
  const lists = POLICY.sections.flatMap((s) => s.blocks.filter((b) => b.kind === 'ul'));
  assert.equal(lists.length, 1);
  assert.deepEqual(lists[0].items, ['ชื่อผู้เล่นที่คุณใส่', 'รายชื่อในเครื่องมือสุ่ม และช่วงตัวเลขล่าสุด', 'การตั้งค่าเกม และการเปิดปิดเสียง']);
});

test('linking a line never changes its text, and every link the board names is made', () => {
  const { policyLines, linkRuns } = policyModule;
  assert.ok(typeof linkRuns === 'function', 'the module must export linkRuns');
  const links = [];
  for (const line of policyLines()) {
    const runs = linkRuns(line);
    assert.equal(runs.map((r) => r.text).join(''), line, 'the runs must rebuild the line exactly');
    for (const r of runs) if (r.href) links.push(`${r.text} -> ${r.href}`);
  }
  assert.deepEqual(links, [
    'หน้าติชมและเสนอเกม -> /feedback/',
    'adssettings.google.com -> https://adssettings.google.com',
    'optout.aboutads.info -> https://optout.aboutads.info/',
    'หน้าติชมและเสนอเกม -> /feedback/',
  ]);
});

test('the page renders the module in the site chrome, under the board title, and is indexable', () => {
  const src = read(PAGE);
  assert.ok(src, 'src/pages/privacy/index.astro must exist');
  assert.match(src, /from '\.\.\/\.\.\/components\/privacy-policy'/, 'the page renders the policy module, never a retyped copy');
  assert.match(src, /title="นโยบายความเป็นส่วนตัว — วัดดวง"/, 'the board title');
  assert.match(src, /<Base\b[^>]*\bchrome\b/, 'Base must get chrome, so its plain footer does not ship beside PageChrome');
  assert.match(src, /<PageChrome>/);
  assert.doesNotMatch(src, /\bnoindex\b/, 'the policy must be indexable');
  assert.match(src, /keepThaiWords\(POLICY\.title\)/, 'the h1 goes through keepThaiWords');
  // No retyped policy line in the template: every approved line reaches the page through the module.
  // The <Base> tag is metadata and carries the board title, which contains the h1 line by design.
  const template = src.replace(/^---[\s\S]*?^---$/m, '').replace(/<Base\b[^>]*>/, '');
  assert.match(template, /<PageChrome>/, 'positive control: the frontmatter strip left the template');
  const retyped = approvedGroups().flat().filter((line) => template.includes(line));
  assert.deepEqual(retyped, []);
});

test('placement A: the home feedback band and the feedback privacy line link the page', () => {
  const home = read(join(here, 'index.astro'));
  const band = home.match(/<div class="band band-feedback">[\s\S]*?<\/div>\s*<\/div>/)?.[0];
  assert.ok(band, 'positive control: the home feedback band must be found');
  assert.match(band, /<a class="feedback-privacy" href="\/privacy\/">/, 'the band carries the policy link');
  const feedback = read(join(here, 'feedback', 'index.astro'));
  const line = feedback.match(/<p class="fb-privacy">[\s\S]*?<\/p>/)?.[0];
  assert.ok(line, 'positive control: the feedback privacy line must be found');
  assert.match(line, /\{PRIVACY\}\s*<a [^>]*href="\/privacy\/"/, 'the link closes the privacy line');
});

test('the footer stays brand-only: PageChrome gains no anchor and no policy link', () => {
  const chrome = read(join(here, '..', 'components', 'PageChrome.astro'));
  const footer = chrome.match(/<footer[\s\S]*?<\/footer>/)?.[0];
  assert.ok(footer, 'positive control: the footer element must be found');
  assert.doesNotMatch(footer, /<a\b/);
  assert.doesNotMatch(chrome, /\/privacy\//);
});
