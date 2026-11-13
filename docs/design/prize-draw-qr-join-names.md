# Prize-draw QR join: the name rules

Companion to [ADR-0076](../adr/0076-the-prize-draw-qr-join-is-a-second-function-in-the-feedback-app.md). The code is `checkName` and `nameKey` in `services/feedback/src/join.mjs`; the tests are `join-name.test.mjs`. Siblings: [protocol](prize-draw-qr-join-protocol.md), [concurrency](prize-draw-qr-join-concurrency.md).

## An allow-list this code owns; the sink still escapes

A deny-list of bad characters cannot converge: REFUTE round 1 joined `Ton` and `T` + U+034F COMBINING GRAPHEME JOINER + `on` side by side, because that joiner is an invisible mark, not a control or format character, and Unicode keeps adding such code points. So `checkName` admits only a set it owns:

- Thai letters, vowels and marks (U+0E01-U+0E3A, U+0E40-U+0E4E) and Thai digits (U+0E50-U+0E59);
- ASCII letters and digits;
- the space, and `.` `-` `'` `_`.

In order: the input must be well-formed UTF-16 (a lone surrogate, even one sent as a JSON escape, is refused, reason `lone-surrogate`); NFC; any control, format, private-use, unassigned or line/paragraph separator is refused first with reason `control` (only to give a clearer reason, since the allow-list refuses them anyway); whitespace runs collapse to one space and the ends are trimmed (so a no-break space is a space); at most 64 UTF-16 code units; then anything outside the set is refused, reason `emoji` for an emoji or flag and `charset` for everything else (other scripts, accented Latin, full-width forms, markup characters, invisible marks). An empty result has reason `empty`, and too many clusters `too-long`.

## Clusters

Clusters are split by a rule this code owns, not by the runtime's ICU (Node 22 in CI, 24 on the host): a Thai mark or SARA AM (U+0E33) joins the code point before it; anything else starts a cluster. On the allowed set this equals the UAX #29 count, so `ปู่` and `น้ำ` are one each. At most **12 clusters** (owner ruling 2026-11-11). Each cluster:

- a mark or SARA AM needs a Thai consonant (U+0E01-U+0E2E) under it, not the start of the name, a space, a Latin letter, a digit or a vowel letter (reason `leading-mark`);
- at most 3 code points; never the same mark twice (it prints on top of itself); at most one SARA AM, and only right after a consonant or a tone mark (U+0E48-U+0E4B) (reason `stacked-marks`).

SARA AM is a spacing letter, not a mark, yet the gh#302 boards measured that it never leaves its cluster: a consonant followed by 23 of them is one cluster, which is why it is bounded here. The page maps each reason to a Thai message (the page half).

## No pre-escaping

Markup characters are outside the set, so `<`, `>`, `&`, `=` and `"` never reach a stored name. The server still never pre-escapes (the apostrophe is allowed, and a pre-escaped name would be escaped twice at the sink).

## The sink is gh#308's page half and gh#309

They render names as text (`textContent`) or through an escape helper in the class `src/play/name-escaping.test.mjs` pins, and each carries its own sink test feeding markup. The admin-typed roster (decision 4's first mode) never passes this server, so the sink escape is required either way; the server rules do not substitute for it (ADR-0026's channel class).

## Uniqueness key

NFKC (which splits SARA AM into NIKHAHIT + SARA AA, so the two spellings of one syllable meet), lower case, spaces removed, two SARA E (U+0E40 U+0E40) folded to SARA AE (U+0E41), the obsolete KHO KHUAT and KHO KHON folded to KHO KHAI and KHO KHWAI, and the marks on each consonant sorted (typing order of two marks is lost); then SHA-256. The key is the blob name, and the conditional create makes "taken" atomic.

## Not folded

Look-alikes inside the allowed set: `I`, `l` and `1`; `O`, `0` and Thai digit zero; LAKKHANGYAO against SARA AA. Admin review is the guard for those. The phone counts clusters with its own browser's ICU; the server's count rules.
