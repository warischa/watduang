# Word bank contract (gh#311, phase 3)

The one frozen contract the bank-authoring ticket and the engine ticket build against. Code:
`src/prize-words/schema.ts` (types and closed vocabularies), `bank-th.ts` and `bank-en.ts` (seed
banks), `bank-oracle.test.mjs` (the oracle). Where this file and a code comment differ, this file wins.

## Principles

- **Written form.** Every attribute is defined by how the word is WRITTEN, and condition wording must
  name what it tests ("first consonant", not "starts with" when a leading vowel can come first).
- **Stored, never derived at runtime.** Every attribute is a stored cell. Spelling-level cells are
  re-derived by the oracle test; judged cells are reviewed by people and models and never computed.
- **The derivation lives only in the oracle test.** Runtime modules under `src/prize-words/` hold data
  and types. The oracle walks their TypeScript AST and allows only type declarations, `import type`,
  and plain `const`s (never `using`) whose initializers are literal trees. Calls, property and element
  reads, `__proto__` keys, functions, classes and templates are rejected. The directory, at any depth,
  may hold only `schema.ts`, `bank-th.ts`, `bank-en.ts`, the two JSON pins and top-level `*.test.mjs`.

## Pools, ids and order

- Four pools per language: `general`, `office` (ออฟฟิศ), `food` (อาหาร), `animal` (สัตว์). The pool is
  the theme. A word's text is unique within its language.
- A bank is one array per pool. **Append-only:** a word keeps its position forever; nothing is deleted,
  reordered or renumbered. A withdrawn word stays in place with `retired: true`.
- Id = `<lang>-<pool>-<NNN>`, NNN being the 1-based position, zero-padded to 3. The oracle checks id
  against position, so an insert or reorder reds. Phones derive a word by id or index, so a changed
  order changes what a phone shows.
- `ids-snapshot.json` pins every id to its text. Its keys equal the bank's ids in both directions, and
  each stays at the same pool position with the same text, so a swap with ids reassigned reds.

## Bank revision

`BANK_REVISION` in `schema.ts` is a literal number that engines carry in their codes. `revisions.json`
maps each revision to a sha256 of the dealable content: per language and pool, in order, every word
with every stored field except `note`. Any bank edit that changes what can be dealt (an attribute,
`eligible`, `review`, `retired`, an append) reds the oracle until `BANK_REVISION` is bumped by one and
the new hash is appended. Existing entries are never edited. Fields are hashed as engines read them,
so a value inherited through a prototype counts.

**Ceiling: `BANK_REVISION` ≤ 10** (`src/prize-round/revision-ceiling.test.mjs`). A code carries the
revision mod 10, so revision 11 would pass for 1. Past 10, bump `CODE_FORMAT` (`parseFamilyCode`
refuses any other format digit) and raise the ceiling by 10. Two costs: every `review`, `eligible` or
`retired` flip is a revision, so the ceiling can be reached soon; and after a format bump an older
page refuses the new codes as mistyped, not as a stale bank.

## Allowed codepoints (oracle-checked)

- **Thai:** the 44 consonants (U+0E01–U+0E2E minus U+0E24 and U+0E26), vowel signs U+0E30–U+0E39,
  leading vowels U+0E40–U+0E44, U+0E47, tone marks U+0E48–U+0E4B, การันต์ U+0E4C. Text is NFC.
- Excluded: ฤ ฦ (vowels, not in the consonant table), ๆ, ฯ, digits, spaces, invisible characters,
  and U+0E4D followed by U+0E32 (a lookalike of ำ U+0E33).
- **English:** lowercase `a`–`z` only. No spaces, hyphens or capitals.

## Spelling-level attributes (stored, re-derived by the oracle)

| Attribute | Definition | Example |
|---|---|---|
| `firstChar` | First codepoint | เก้าอี้ → เ |
| `firstConsonant` (TH) | First codepoint found in the 44-consonant table; leading vowels เ แ โ ใ ไ are skipped | เก้าอี้ → ก; หมา → ห |
| `lastChar` | Last codepoint | จันทร์ → U+0E4C; น้ำ → ำ |
| `letters` | Distinct codepoints, ascending by codepoint (vowel signs and marks included) | กุ้ง → ก ง U+0E38 U+0E49 |
| `toneMarks` (TH) | Distinct marks from U+0E48–U+0E4B present, in that order. U+0E47 is not a tone mark | เก้าอี้ → [U+0E49]; เป็ด → [] |
| `karan` (TH) | U+0E4C present | จันทร์ → true |
| `length` | **Number of codepoints** | ที่ → 3; น้ำ → 3 |
| `consonantClass` (TH) | Class of `firstConsonant`: high / mid / low | หมา → high (class of ห) |
| `doubleLetter` (EN) | Two adjacent letters are the same letter | coffee → true; banana → false |

**Length is codepoints, not grapheme clusters.** Measured on Node 22.22: `Intl.Segmenter` counts
น้ำ as 1 cluster and นา as 2, because ำ joins its cluster and า does not. A room cannot predict that,
and cluster rules ride the ICU version. Codepoints over the allowed list are deterministic. Condition
wording must say every written character counts, vowels and marks included.

**Consonant table:** high (11) ข ฃ ฉ ฐ ถ ผ ฝ ศ ษ ส ห · mid (9) ก จ ฎ ฏ ด ต บ ป อ · low (24) ค ฅ ฆ ง ช
ซ ฌ ญ ฑ ฒ ณ ท ธ น พ ฟ ภ ม ย ร ล ว ฬ ฮ. The oracle pins the sizes and that the table is exactly the
consonant block minus ฤ and ฦ.

## Judged attributes (stored, reviewed, never computed)

| Attribute | Definition |
|---|---|
| `syllables` | Syllable count; `null` when the word has two accepted readings |
| `liveDead` (TH) | คำเป็น / คำตาย; `null` unless the word has exactly one syllable |
| `vowels` (TH) | Written vowel forms from `VOWEL_FORMS`, in order of first appearance. An inherent vowel that is pronounced but not written is never listed, so ขนม has none |
| `wordType` (EN) | noun / verb / adjective. The English bank admits only words with exactly one word type |
| pool | The theme: which pool array holds the word |
| `workplaceSafe` | Literal `true`: no brands, alcohol, profanity or gambling words. A word that fails is not in the bank |

The oracle checks judged cells for shape and cross-rules only: a known value; `liveDead` non-null only
when `syllables` is 1; each vowel form known, listed once and written in the word, and every written
vowel sign covered by some listed form; no word from the gambling and alcohol avoid list
([CONTEXT.md](../../CONTEXT.md) _Avoid_). Brands and profanity are not enumerable and stay with review.

**Review** (owner ruling 2026-11-19): judged cells are reviewed by a cross-lineage model panel with
dictionary citations; the owner reviews the disagreement list plus a sample. `review` is `pending`
until then, and only `reviewed` words may reach players. `note` holds the citation or an exclusion
reason. **Every seed word is `pending`:** the seed judgements are unreviewed.

## Condition families and eligibility

A family is the set of conditions that read one attribute. Each word lists the families it takes part
in (`eligible`, in the schema's family order), so a family enumerates "bank words flagged eligible for
it", a set we own.

- **Spelling families** (`firstChar`, `firstConsonant`, `lastChar`, `letters`, `toneMarks`, `karan`,
  `length`, `consonantClass`, `doubleLetter`): eligibility is derived, and the oracle checks it
  exactly. Every word is eligible, except that a Thai word whose last codepoint is a combining mark
  (ที่, จันทร์, เก้าอี้) is not eligible for `lastChar`: "ends with" over a mark misleads a room.
  ำ is a spacing letter, so น้ำ is eligible.
- **Judged families** (`vowels`, `syllables`, `liveDead`, `wordType`): the reviewer decides. The
  oracle requires a non-null value wherever the family is listed, so `liveDead` covers one-syllable
  words only and `syllables` excludes words with two accepted readings.
- English conditions are letters only: "contains the letter e", never "contains a vowel sound".

## Event-mode composition requirement

Owner rulings 2026-11-19, not yet on the ticket:

- Word games in event mode play **only half-cut rounds**: live = 2 × keep, the same rule as cards
  (`cutsInHalf` in `src/prize-event/event.ts`).
- Polarity (match = survive, or match = out) stays free until the rule is drawn.
- Games 2–4 use two candidate scripts plus a rule tap, half-cut only.

At a half-cut round with candidate conditions A and B, every person is in exactly one of two groups,
A-not-B or B-not-A, and is dealt a hand of 3 distinct words from that group. So a candidate pair is
**feasible for a pool only if each of those two quadrants holds at least 3 words eligible for both
families**. More is better: 100 holders sharing one 3-word quadrant all see the same hand.

The engine ticket computes feasible pairs from the bank; nobody keeps a hand-written pair list. **The
seed bank is contract shape only and does not meet this requirement** (4–6 words per pool); bank size
targets come from the engine ticket's feasibility count.

## Adding a word

Append to the end of its pool with the next id, type every cell by hand, set `review: 'pending'`, add
its id and text to `ids-snapshot.json` in the same commit, bump `BANK_REVISION` with its new hash, and
run `node --test 'src/prize-words/*.test.mjs'`. A wrong spelling cell fails with the word id, the
attribute, the stored value and the derived value. Note that Node 22 does not collect the directory
form `node --test src/prize-words/`; it reports the directory as a missing module.

## Thai link-letter rule for คำต่อคำ (owner ruling 2026-11-19)

A Thai word is chain-eligible only when its last written character is a consonant from the
44-consonant table, so a word ending in a vowel sign, a tone mark or การันต์ never joins a chain. The
next word must start with that consonant as its `firstConsonant` (leading vowels skipped). English
chains link the last letter to the first letter. No attribute is added for it: eligibility is
membership of the stored `lastChar` in the consonant table, evaluated in `src/prize-round/`.

## Open, for the owner

- **The review sample size** for judged cells.
