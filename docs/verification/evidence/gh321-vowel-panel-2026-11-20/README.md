# gh#321: Thai vowel-cell review panel, prepared 2026-11-20

The 2026-11-19 panel left the Thai `vowels` cell unreviewed because the form list lacked four written
forms (see `../gh321-bank-review-2026-11-19/README.md`, "Not covered"). The schema now has them
(`-ือ`, `-ว`, `เ-ย`, `-รร`) and the owner ruled on 2026-11-20 to run the vowel panel. This directory
prepares it: a blind input with planted wrong cells, the reviewer instructions, and the merge. No
reviewer has been run yet, so nothing here is a result.

## Files

| File | What it is |
|---|---|
| `make-input.mjs` | Generator. Reads the unretired Thai bank and `VOWEL_FORMS` at run time, writes `input-th.tsv`, plants 20 wrong cells, writes the key |
| `input-th.tsv` | What reviewers read: header `id, pool, word, vowels`, one row per unretired Thai word, sorted by id, vowels joined with `\|`. 20 cells are planted |
| `instructions-th.md` | What reviewers are told, in English. Embeds the live form list and the spec's definitions |
| `merge.mjs`, `merge.test.mjs` | Calibration, agreed fixes, owner list; its `node:test` file |

The key (id, class, true cell, planted cell, salt) is **outside the repo until the panel returns**,
because reviewers can read the repo. Once the panel has returned it can be committed here as
`planted-cells.json`, as the 2026-11-19 panel did. The generator refuses a key path inside the repo.

## Plants

20 rows, 5 per class, each with one error, each chosen by a salted hash of the id (the salt lives only in
the key file) and each still accepted by the bank oracle's `checkVowels`, which `make-input.mjs` proves
at every run (it prints `20/20`) by slicing that function out of the oracle test rather than copying it.

| Class | What was done to the true cell |
|---|---|
| wrong form | one listed form replaced by a different form whose letters are also written in the word |
| omission | one written form dropped |
| decomposition | one compound form split into smaller listed forms (เ-ือ → เ- and -ื: the split เ- and -ือ is refused by the oracle, so it would calibrate nothing) |
| extra | one form added that the word does not write as a separate form |

Words whose text places one of the four new forms are never planted: their stored cell predates those
forms and may be stale.

## How to run

1. Generate the input and the key (first run needs a salt; later runs read it from the key file, and
   the output is byte-identical):

   `node docs/verification/evidence/gh321-vowel-panel-2026-11-20/make-input.mjs <key-path> <salt>`

2. Dispatch two independent reviewers (GPT and Claude), each given only `input-th.tsv` and
   `instructions-th.md`, each writing its disagreeing rows to a TSV (`panel-gpt-th-vowels.tsv`,
   `panel-claude-th-vowels.tsv`).

3. Merge:

   `node docs/verification/evidence/gh321-vowel-panel-2026-11-20/merge.mjs <key-path> panel-gpt-th-vowels.tsv panel-claude-th-vowels.tsv`

   It prints calibration per reviewer per class (caught = proposed a different cell for a planted row,
   restored = proposed the true cell), then writes `agreed-vowels.tsv` and
   `owner-disagreements-vowels.tsv` (plant rows excluded from both). A malformed reviewer line (wrong
   column count, unknown id, a form outside `VOWEL_FORMS`, a repeated id, a proposal equal to the stored
   cell) is reported and the exit code is 1 with nothing written. In the written files an empty cell
   reads `-`.

4. Tests: `node --test docs/verification/evidence/gh321-vowel-panel-2026-11-20/merge.test.mjs`

## Not covered

- Applying any fix to the bank: nothing here edits `bank-th.ts`. Agreed rows and the owner list are
  inputs to that next step.
- Two models agreeing is not a human check; the owner reviews the disagreement list and a sample.
- Calibration is one run per reviewer over 20 plants of four classes: a rate, not a distribution. A plant
  that is caught says nothing about subtler errors in real rows.
- Words with two accepted readings: the instructions ask reviewers to say so in `reason`, nothing enforces it.
- `merge.mjs` does not check the `stored` column a reviewer echoes, only the `proposed` one.
- The pool, syllable and live/dead cells, and English words: out of scope, already reviewed or untouched.
- `input-th.tsv` is committed with the planted cells in it, so after the panel the bank and the input differ
  on exactly those rows; the input is not a copy of the bank.

## Result (2026-11-20)

Both reviewers judged 447/447 rows and flagged 20 rows each, all of them planted.

| Reviewer | Dispatch | Caught | Restored the true cell | Non-plant flags |
|---|---|---|---|---|
| GPT (codex `gpt-6.2-sol`, high, `ca reasoner`, read-only) | 133 s, 166k input tokens | 20/20 (5/5 per class) | 20/20 | 0 |
| Claude (`deep-reasoner`, read-only) | 348 s | 20/20 (5/5 per class) | 20/20 | 0 |

- `merge.mjs` exit 0: `agreed-vowels.tsv` and `owner-disagreements-vowels.tsv` are header-only — no vowel
  fix is proposed and no vowel row joins the owner's list.
- `planted-cells.json` is the key, committed after both reviewers returned.
- Reading: on these 447 cells, two independent reviewers who catch every planted error of four classes
  found no real error. It does not prove the cells right: the catch rate covers only the planted classes.
- The four forms added the same day (`-ือ`, `-ว`, `เ-ย`, `-รร`) appear in no stored cell, so no row was
  judged against them; words that need them (มือ, หมวก, เนย, กรรไกร) are added with the owner-verdict commit.
