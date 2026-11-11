#!/usr/bin/env node
// gh#303 source scan, the raw-file half of the Thai check (render-boards.mjs reads the RENDERED text, which is the
// half markup cannot split a word past). Over whole files, fails on:
//   - a letter or mark (\p{L}, \p{M}) that is neither ASCII nor in the Thai block U+0E00-U+0E7F
//   - U+25CC or an invisible character (U+200B-U+200D, U+2060, U+FEFF)
//   - a numeric character reference (&#...;), which would hide a foreign letter from this raw scan
//   - a word gh#299 bars (held here as escapes, so this file does not carry them)
// Usage: node thai-scan.mjs <file> [...]

import { readFileSync } from 'node:fs';

const BARRED = ['\u0e2b\u0e27\u0e22', '\u0e25\u0e2d\u0e15\u0e40\u0e15\u0e2d\u0e23\u0e35\u0e48', '\u0e40\u0e2a\u0e35\u0e48\u0e22\u0e07\u0e42\u0e0a\u0e04',
  '\u0e44\u0e1e\u0e48\u0e1b\u0e4a\u0e2d\u0e01', '\u0e41\u0e17\u0e07', '\u0e40\u0e14\u0e34\u0e21\u0e1e\u0e31\u0e19', '\u0e44\u0e2e\u0e42\u0e25'];
const INVISIBLE = /[\u200b-\u200d\u2060\ufeff\u25cc]/u;

let bad = 0;
for (const file of process.argv.slice(2)) {
  const text = readFileSync(file, 'utf8');
  const other = new Map(); const foreign = new Set(); let thai = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) continue;
    if (cp >= 0x0e00 && cp <= 0x0e7f) { thai++; continue; }
    const key = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    other.set(key, (other.get(key) ?? 0) + 1);
    if (/[\p{L}\p{M}]/u.test(ch) || INVISIBLE.test(ch)) foreign.add(key);
  }
  const refs = text.match(/&#x?[0-9a-fA-F]+;/g) ?? [];
  const barred = BARRED.filter((w) => text.includes(w)).map((w) => [...w].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(' '));
  const fail = foreign.size || barred.length || refs.length;
  if (fail) bad++;
  console.log(`${fail ? 'FAIL' : 'ok'} ${file.split('/').pop()}: thai codepoints ${thai}; foreign letters/marks/invisibles ${[...foreign].join(',') || 'none'}; character references ${refs.length ? [...new Set(refs)].join(' ') : 'none'}; barred words ${barred.join(' | ') || 'none'}; other non-ASCII ${[...other].map(([k, n]) => `${k}x${n}`).join(' ') || 'none'}`);
}
process.exitCode = bad ? 1 : 0;
