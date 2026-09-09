#!/usr/bin/env node
// gh#104 — an OG card is a rendered artifact of source copy, and nothing was watching the join.
// A tagline changed in src/games and the card on disk kept the old sentence; that mismatch shipped
// live with every other gate green, because no gate reads a PNG.
//
// This gate never renders. CI has no librsvg and no Thai font, so re-rendering to compare would be
// a check that cannot run there. Instead scripts/make-og.mjs stamps scripts/og-cards.lock.json with
// the logical text lines it rendered from and the sha256 of the bytes it wrote, and this gate:
//
//   1. recomputes the lines from CURRENT source via scripts/og-card-text.mjs and compares them to
//      the stamped ones — a difference means the card is STALE (the bug above),
//   2. hashes the PNG on disk and compares to the stamped sha256 — a difference means the file was
//      hand-edited, swapped, or half-written,
//   3. applies the shared party-size CLAIM regex to every line of a card whose source category is
//      not 'party' — gh#89 / ADR-0040: the player-count range is true of the party category, not
//      of a fortune page and not of the site card.
//
// THE SET is enumerated FROM DISK (public/og/*.png), never from the manifest. The manifest has a
// permanent hole: love-match is deliberately unregistered until gh#101 rebuilds the page, so a
// manifest-driven walk would silently skip a card that is live in every share preview. A PNG with
// neither a lock entry nor an explicit exemption is a failure, so the set cannot quietly shrink.
//
// NOT COVERED (ADR-0019): the pixels, and generator-code drift. This gate proves the text a card was
// rendered FROM and that the bytes have not moved since — it cannot see that the Thai glyphs composed
// correctly, which is the failure make-og.mjs's own header warns about. Nor does it see a change to
// the artwork table or the layout code: the lock records TEXT, so editing MARKS or the geometry in
// make-og.mjs leaves every card "fresh" while the rendered card changes. Open the image and look.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SITE, cardLines } from './og-card-text.mjs';
import { CLAIM } from './party-size-claim.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OG_DIR = path.join(repoRoot, 'public/og');
const LOCK = path.join(repoRoot, 'scripts/og-cards.lock.json');

// EXPLICIT exemptions, one line of reasoning and one owner each. Never derived from "absent from
// the manifest" — that is how a carve-out becomes silent. Printed on every run, green or red.
const EXEMPTIONS = {
  'love-match': 'gh#101 owns it — the game is deliberately unregistered in the manifest until that ticket rebuilds the page, so no source entry exists to regenerate the card from',
};

/** Every failure this gate can report, as data — so one run reports all of them, labelled. */
export function verdict({ id, png, entry, source, exemption }) {
  // An exemption holds only while nothing can answer for the card. The moment a source does --
  // gh#101 registering love-match in the manifest is exactly that -- the carve-out has outlived the
  // premise it was granted on, and must fail rather than keep skipping a card that is now checkable.
  if (exemption) {
    if (!source) return [];
    return [{ id, kind: 'exemption-stale', detail: `${id} is exempt on the grounds that no source entry answers to that id, but one now does — delete the exemption in scripts/og-card-check.mjs and lock the card: node scripts/make-og.mjs ${id}` }];
  }
  if (!entry) return [{ id, kind: 'unlocked', detail: `public/og/${id}.png has no entry in scripts/og-cards.lock.json and no exemption` }];
  const found = [];
  const sha = createHash('sha256').update(png).digest('hex');
  if (sha !== entry.sha256) {
    found.push({ id, kind: 'bytes-moved', detail: `public/og/${id}.png sha256 ${sha.slice(0, 12)} != locked ${String(entry.sha256).slice(0, 12)} — the file changed without make-og.mjs writing it` });
  }
  if (!source) {
    found.push({ id, kind: 'no-source', detail: `${id} is locked but no source entry answers to that id — delete the card and its lock entry, or exempt it` });
    return found;
  }
  const now = cardLines(source);
  if (JSON.stringify(now) !== JSON.stringify(entry.lines)) {
    found.push({ id, kind: 'stale', detail: `${id} source text is now ${JSON.stringify(now)} but the card was rendered from ${JSON.stringify(entry.lines)} — regenerate: node scripts/make-og.mjs ${id}` });
  }
  if (source.category !== 'party') {
    // CLAIM carries /g, so match() and not test() — lastIndex would make a loop alternate.
    for (const line of now) {
      const hit = line.match(CLAIM);
      if (hit) found.push({ id, kind: 'party-size-claim', detail: `${id} is category "${source.category ?? 'none'}" but its card text states a player-count range "${hit[0]}" — gh#89 / ADR-0040` });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Self-test: pure, no disk IO and no renderer — verdict() takes plain objects, so synthetic cards
// exercise the real detection. Calibrated both ways on every leg: a good card stays silent and the
// mutated twin of that same card is flagged with the expected label.
// ---------------------------------------------------------------------------
function selftest() {
  const fortune = { id: 'daily-fortune', names: { th: 'ดวงรายวัน' }, tagline: 'เปิดดวงวันนี้', category: 'fortune' };
  const party = { id: 'timebomb', names: { th: 'ระเบิดเวลา' }, tagline: 'ส่งต่ออย่าให้ค้างมือ', category: 'party', players: [2, 10] };

  const fLines = cardLines(fortune);
  assert.equal(fLines.length, 2, 'a fortune card gets a title and a tagline and no player-count line');
  assert.equal(fLines.join(' ').match(CLAIM), null, 'and nothing in a fortune card matches the party-size claim');
  const pLines = cardLines(party);
  assert.equal(pLines.length, 3, 'a party card gets the player-count line as a third line');
  assert.deepEqual(pLines[2].match(CLAIM), ['2-10 คน'], 'POSITIVE CONTROL: the party line must actually match CLAIM, or the fortune leg above proves nothing');
  assert.equal(cardLines(SITE).length, 2, 'the site card has no category so it takes the non-party arm');
  console.log('PASS lines: fortune -> no count line, party -> a count line CLAIM matches, site -> no count line');

  const png = Buffer.from('not really a png, but the hash is all this gate reads');
  const good = { id: 'daily-fortune', png, source: fortune, entry: { lines: fLines, sha256: createHash('sha256').update(png).digest('hex') } };
  assert.deepEqual(verdict(good), [], 'known-good: matching hash and matching lines must be silent');
  console.log('PASS known-good: a card whose bytes and lines both match its lock entry is silent');

  const swapped = { ...good, png: Buffer.from('different bytes entirely') };
  assert.deepEqual(verdict(swapped).map((f) => f.kind), ['bytes-moved'], 'known-bad: a PNG whose hash moved must be flagged, and only for that');
  console.log('PASS bytes-moved: a hand-edited or swapped PNG is flagged');

  const stale = { ...good, source: { ...fortune, tagline: 'คำโปรยใหม่ที่ยังไม่ได้เรนเดอร์' } };
  assert.deepEqual(verdict(stale).map((f) => f.kind), ['stale'], 'known-bad: source copy that moved without a regeneration must be flagged stale');
  console.log('PASS stale: a tagline changed in source without regenerating the card is flagged');

  const claiming = { ...good, source: { ...fortune, tagline: 'เล่นฟรี 2-10 คน ไม่ต้องโหลดแอป' } };
  const kinds = verdict(claiming).map((f) => f.kind);
  assert.ok(kinds.includes('party-size-claim'), 'known-bad: a player-count range on a non-party card must raise the CLAIM failure specifically');
  console.log(`PASS party-size-claim: a count range on a fortune card is flagged (alongside ${kinds.filter((k) => k !== 'party-size-claim').join(', ') || 'nothing else'})`);

  assert.deepEqual(verdict({ ...good, entry: null, source: null, exemption: 'gh#101 owns it' }), [], 'an exempt card with no source entry must pass');
  assert.deepEqual(verdict({ ...good, entry: null, source: null }).map((f) => f.kind), ['unlocked'], 'POSITIVE CONTROL: the same sourceless card WITHOUT the exemption must be flagged unlocked');
  console.log('PASS exemption: an exempt sourceless card passes, the identical card without the exemption does not');

  assert.deepEqual(verdict({ ...good, entry: null, exemption: 'gh#101 owns it' }).map((f) => f.kind), ['exemption-stale'], 'known-bad: an exemption whose id a source now answers to must fail, not keep skipping the card');
  console.log('PASS exemption-stale: once a source exists for an exempt id, the carve-out fails instead of greening a card it stopped checking');
}
if (process.argv.includes('--selftest')) {
  selftest();
} else {
  const { games } = await import(path.join(repoRoot, 'src/games/manifest.ts'));
  const sources = new Map([...games, SITE].map((g) => [g.id, g]));

  const pngs = fs.readdirSync(OG_DIR).filter((f) => f.endsWith('.png')).sort();
  if (pngs.length === 0) {
    console.error('og-card-check: enumerated 0 cards in public/og — the walk is broken, not the tree');
    process.exit(1);
  }
  if (!fs.existsSync(LOCK)) {
    console.error('og-card-check: scripts/og-cards.lock.json is missing — regenerate every card with scripts/make-og.mjs');
    process.exit(1);
  }
  const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));

  const failures = pngs.flatMap((file) => {
    const id = file.replace(/\.png$/, '');
    return verdict({
      id,
      png: fs.readFileSync(path.join(OG_DIR, file)),
      entry: lock[id] ?? null,
      source: sources.get(id) ?? null,
      exemption: EXEMPTIONS[id],
    });
  });

  // A lock entry with no PNG is the other direction of the same drift — a card deleted from disk
  // while its stamp stayed behind would otherwise never be read.
  const onDisk = new Set(pngs.map((f) => f.replace(/\.png$/, '')));
  for (const id of Object.keys(lock)) {
    if (!onDisk.has(id)) failures.push({ id, kind: 'missing-png', detail: `scripts/og-cards.lock.json stamps "${id}" but public/og/${id}.png does not exist` });
  }

  for (const f of failures) console.error(`og-card-check [${f.kind}]: ${f.detail}`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s) across ${new Set(failures.map((f) => f.id)).size} card(s). This gate reads text and bytes only — it never renders, because CI has no librsvg and no Thai font.`);
    process.exit(1);
  }

  const exempt = Object.entries(EXEMPTIONS).map(([id, why]) => `${id} (${why})`);
  console.log(
    `og-card-check: ${pngs.length} card(s) on disk, ${pngs.filter((f) => !EXEMPTIONS[f.replace(/\.png$/, '')]).length} locked and fresh against current source, 0 player-count claims outside the party category.`,
  );
  console.log(`  exempt, by name: ${exempt.join(' · ')}`);
  console.log('  NOT COVERED (ADR-0019): the rendered pixels, and generator-code drift — the lock records text, so a MARKS or layout change leaves cards "fresh". Open the image and look at it.');
}
