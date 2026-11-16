#!/usr/bin/env node
// gh#317 / gh#318 board generator. Writes, into design/:
//   Gh317Envelopes.dc.html  the gift-envelope final (ซองของขวัญ)
//   Gh318Cards.dc.html      the turn-a-card final (เปิดไพ่ชิงรางวัล)
// The shared mechanic (pick -> reveal -> prize slot) is designed once in shared.mjs; each board adds its own look.
// Deterministic: seeded PRNGs and literal values, so a re-run writes the same bytes. The gh#303 libs (lib.mjs,
// stage.mjs, grammar.mjs) are imported read-only from ../gh303-boards-2026-11-11 at commit 1f57574; this generator
// never writes into that directory or into gh#302's. Usage: node make-boards.mjs [Board ...] (no argument: both).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnvelopes } from './board-envelopes.mjs';
import { buildCards } from './board-cards318.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const designDir = path.resolve(here, '../../../../design');
const ALL = { Gh317Envelopes: buildEnvelopes, Gh318Cards: buildCards };
const pick = process.argv.slice(2);
for (const [name, build] of Object.entries(ALL)) {
  if (pick.length && !pick.includes(name)) continue;
  const html = build();
  writeFileSync(path.join(designDir, `${name}.dc.html`), html);
  console.log(`${name}.dc.html ${Buffer.byteLength(html)} bytes`);
}
