#!/usr/bin/env node
// gh#325 banned-word scan, FROZEN kit file: casino and gambling props and wording over a board's raw HTML (markup,
// CSS, class names and annotation included), case-insensitive, whole words. The set is CONTEXT.md's company-party
// _Avoid_ list (its seven Thai words and the casino props: felt table, chips, money) plus the obvious casino nouns.
// The Thai words are held as escapes so this file does not carry them (the Thai scan would fail on it).
// Usage: node banned-scan.mjs <board.dc.html> [...]   Prints every hit with its line; exit 1 on any hit.
import { readFileSync } from 'node:fs';

const EN = ['casino', 'gambl\\w*', 'chips?', 'felt', 'money', 'poker', 'roulette', 'jackpot', 'bet', 'bets', 'betting', 'wager\\w*', 'dealer', 'croupier', 'lottery', 'blackjack', 'baccarat'];
const TH = ['\u0e2b\u0e27\u0e22', '\u0e25\u0e2d\u0e15\u0e40\u0e15\u0e2d\u0e23\u0e35\u0e48', '\u0e40\u0e2a\u0e35\u0e48\u0e22\u0e07\u0e42\u0e0a\u0e04', '\u0e44\u0e1e\u0e48\u0e1b\u0e4a\u0e2d\u0e01',
  '\u0e41\u0e17\u0e07', '\u0e40\u0e14\u0e34\u0e21\u0e1e\u0e31\u0e19', '\u0e44\u0e2e\u0e42\u0e25', '\u0e04\u0e32\u0e2a\u0e34\u0e42\u0e19', '\u0e1e\u0e19\u0e31\u0e19', '\u0e0a\u0e34\u0e1b', '\u0e40\u0e07\u0e34\u0e19'];
const RE = new RegExp(`(?<![A-Za-z])(${EN.join('|')})(?![A-Za-z])|(${TH.join('|')})`, 'giu');
const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node banned-scan.mjs <board.dc.html> [...]'); process.exit(2); }
let hits = 0;
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n'); let n = 0;
  lines.forEach((l, i) => { for (const m of l.matchAll(RE)) { n++; if (n <= 20) console.log(`${f.split('/').pop()} line ${i + 1}: "${m[0]}" in ...${l.slice(Math.max(0, m.index - 30), m.index + 30).trim()}...`); } });
  console.log(`${n ? 'FAIL' : 'ok'} ${f.split('/').pop()}: ${n} hits`); hits += n;
}
process.exitCode = hits ? 1 : 0;
