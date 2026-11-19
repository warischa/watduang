# gh#321 — word-bank cross-lineage review, 2026-11-19

Review protocol per the owner ruling of 2026-11-19 on #311: spelling-level attributes are re-derived by the test oracle (`bank-oracle.test.mjs`, #320); judged attributes go through two independent model reviewers of different lineage; the owner reviews the disagreement list plus a sample.

## What was reviewed

The full bank as authored on 2026-11-19: Thai 481 words, English 442 words, all `review: 'pending'`. Each reviewer judged every row for: syllables, คำเป็น/คำตาย (Thai) or word type (English), pool fit, spelling, and safety — including "unflattering or embarrassing when shown beside a real person's name", since admin mode shows a word next to each name on the projector. Vowel cells were not reviewed: the vowel-form list in `schema.ts` lacks several written forms (open -ือ, -ัว written with ว, เ-ย, รร), so vowel cells wait on a schema fix (#321).

- Reviewer 1: GPT (codex `gpt-6.2-sol`, high effort), one dispatch per language. Coverage lines: 481 of 481, 442 of 442.
- Reviewer 2: Claude (`deep-reasoner`), one dispatch per language, blind to reviewer 1 and to the planted-cell key. Coverage lines: 481 of 481, 442 of 442.

## Calibration — planted wrong cells

Before export, 32 cells were set to a wrong value (16 per language: syllable counts off by one, คำเป็น/คำตาย flipped, word types rotated). The key is `planted-cells.json`; neither reviewer saw it.

| | planted | GPT flagged | Claude flagged | flagged by both | flagged by neither |
|---|---|---|---|---|---|
| Thai | 16 | 16 | 16 | 16 | 0 |
| English | 16 | 16 | 16 | 16 | 0 |

Every planted cell was flagged by both reviewers; 31 of 32 GPT proposals and 32 of 32 Claude proposals restored the exact original value. n = 1 run per reviewer per language — one run, not a distribution. The catch rate covers only the planted class (off-by-one syllable counts, flipped คำเป็น/คำตาย, rotated word types). It says nothing about subtler errors: both reviewers passed ครู, a word with two accepted readings, which a later code review caught. The owner's sample should lean on two-reading words.

## Outcome

Planted cells excluded, the findings split three ways (`changes.mjs` logic, run in the session scratchpad):

- **Both reviewers agree** (27): Thai pool moves 3; English ambiguous 15 (two readings or two common word types), syllables 1, pool moves 8. Applied except the pool moves: a move is retire-and-append, which would put the same text in the bank twice, and the oracle's text-uniqueness check counts retired words. That check was not weakened; the 8 words whose move is not shadowed by a retirement stay in their old pools and join the owner list. Seven English words with two common word types are retired, because the schema holds one word type per word. The change log is `changes-applied.md`.
- **Retired — both flag as unsafe beside a name** (109): Thai 34, English 75. Retired, never deleted, so ids stay stable. Retired after both steps (`grep -c 'retired: true'`): Thai 34, English 80.
- **Owner list — one reviewer only, or reviewers propose different values** (147): `owner-disagreements.tsv`. Thai: safety 34, ambiguous 2, syllables 1, คำเป็น/คำตาย 1, spelling 1. English: safety 54, ambiguous 45, pool 7, spelling 1, syllables 1.

Raw reviewer output: `panel-gpt-th.tsv`, `panel-gpt-en.tsv`, `panel-claude-th.tsv`, `panel-claude-en.tsv` (columns: id, column, stored, proposed, reason).

## Not covered

- Two models agreeing is not a human check — the owner's review of the disagreement list and a random sample is #321's open HITL box. No word is `reviewed` yet, so no word can reach a player.
- Vowel cells (schema gap above).
- Words removed during authoring as ambiguous were never reviewed.
