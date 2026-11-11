#!/usr/bin/env node
// gh#302 text scan. scanText() is shared with render-boards.mjs, which feeds it the RENDERED text of every frame
// (innerText read over CDP after fonts load), so markup cannot split or hide a character from it.
// This CLI scans files at the source level in two passes:
//   raw      the file as written (catches a foreign letter typed into a string)
//   decoded  tags stripped and character references decoded (catches `&#x0644;` and a word split by `<span>`)
// Either pass fails on:
//   - a letter or mark (\p{L}, \p{M}) that is neither ASCII nor in the Thai block U+0E00-U+0E7F
//   - U+25CC (a shattered Thai mark) or an invisible character (U+200B-U+200D, U+2060, U+FEFF)
//   - a word gh#299 bars from the copy (held here as escapes, so this file does not carry them)
// and, for a board or its generator (.html, .mjs), on hidden text the rendered scan cannot read (REFUTE round 2, F5):
//   - any <template> element (its content is never rendered, so innerText never sees it)
//   - any CSS content: value other than '' / "" / none / normal (pseudo-element text is not in innerText either)
// With those two forbidden, every visible character of a board lives in the DOM, where render-boards.mjs reads it.
// Usage: node thai-scan.mjs <file> [...]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const BARRED = ['หวย', 'ลอตเตอรี่', 'เสี่ยงโชค',
  'ไพ่ป๊อก', 'แทง', 'เดิมพัน', 'ไฮโล'];
const INVISIBLE = /[​-‍⁠﻿◌]/u;
const hex = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

export function scanText(text) {
  const other = new Map(); const foreign = new Set();
  let thai = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) continue;
    if (cp >= 0x0e00 && cp <= 0x0e7f) { thai++; continue; }
    other.set(hex(cp), (other.get(hex(cp)) ?? 0) + 1);
    if (/[\p{L}\p{M}]/u.test(ch) || INVISIBLE.test(ch)) foreign.add(hex(cp));
  }
  const barred = BARRED.filter((w) => text.includes(w)).map((w) => [...w].map((c) => hex(c.codePointAt(0))).join(' '));
  return { ok: !foreign.size && !barred.length, thai, foreign: [...foreign], barred, other: [...other] };
}

// Source-level decode: drop comments and tags, decode numeric and the few named references the boards use.
export function decodeSource(src) {
  return src.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|nbsp);/g, (_, n) => ({ amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ' })[n]);
}

// Hidden-text sources a board may not use. Returns a list of findings (empty = clean).
export function hiddenText(src) {
  const found = [];
  const t = src.match(/<template\b/gi); if (t) found.push(`${t.length} <template> element(s)`);
  for (const m of src.matchAll(/(?<![\w-])content\s*:\s*([^;}{\n]+)/g)) {
    const v = m[1].trim().replace(/\s*!important$/, '');
    if (!["''", '""', 'none', 'normal'].includes(v)) found.push(`CSS content: ${v.slice(0, 40)}`);
  }
  return found;
}

const line = (label, file, r) => `${r.ok ? 'ok' : 'FAIL'} [${label}] ${file}: thai codepoints ${r.thai}; foreign letters/marks/invisibles ${r.foreign.length ? r.foreign.join(',') : 'none'}; barred words ${r.barred.length ? r.barred.join(' | ') : 'none'}; other non-ASCII ${r.other.map(([k, n]) => `${k}x${n}`).join(' ') || 'none'}`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let bad = 0;
  for (const file of process.argv.slice(2)) {
    const src = readFileSync(file, 'utf8');
    for (const [label, text] of [['raw', src], ['decoded', decodeSource(src)]]) {
      const r = scanText(text);
      if (!r.ok) bad++;
      console.log(line(label, file, r));
    }
    if (/\.(html|mjs)$/.test(file)) {
      const h = hiddenText(src);
      if (h.length) bad++;
      console.log(`${h.length ? 'FAIL' : 'ok'} [hidden-text] ${file}: ${h.length ? h.join(' | ') : 'no <template>, no CSS content text'}`);
    }
  }
  process.exit(bad ? 1 : 0);
}
