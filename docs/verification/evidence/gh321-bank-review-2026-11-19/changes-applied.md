# gh#321 word-bank review corrections applied

Inputs: the two reviewers' agreed lists (27 factual fixes, 109 unsafe-beside-a-name retirements). Ids are never changed, moved or renumbered; every word stays `pending`. A retired word keeps its position with `retired: true`.

## Applied: factual fixes (non-pool)

- en-general-016 -> syllables 1 to null, syllables dropped from eligible (word is also on the retire list)
- en-general-022 -> syllables 3 to 2
- en-general-050 -> already on the retire list; wordType ambiguity also confirmed
- en-general-092 -> retired (wordType has two accepted readings; schema has no value for it)
- en-office-022 -> syllables 3 to null, syllables dropped from eligible
- en-office-042 -> syllables 3 to null, syllables dropped from eligible
- en-office-085 -> syllables 2 to null, syllables dropped from eligible (word is also on the retire list)
- en-office-095 -> retired (wordType has two accepted readings; schema has no value for it)
- en-office-100 -> syllables 4 to null, syllables dropped from eligible
- en-office-101 -> syllables 3 to null, syllables dropped from eligible
- en-office-107 -> retired (wordType has two accepted readings; schema has no value for it)
- en-office-110 -> retired (wordType has two accepted readings; schema has no value for it)
- en-food-018 -> syllables 3 to null, syllables dropped from eligible
- en-food-068 -> already on the retire list; wordType ambiguity also confirmed
- en-food-091 -> syllables 2 to null, syllables dropped from eligible
- en-animal-065 -> retired (wordType has two accepted readings; schema has no value for it)

## Applied: retired as unsafe beside a person's name (109)

- th-general-082 -> retired
- th-general-093 -> retired
- th-general-095 -> retired
- th-general-101 -> retired
- th-general-119 -> retired
- th-general-122 -> retired
- th-general-130 -> retired
- th-general-132 -> retired
- th-general-155 -> retired
- th-general-161 -> retired
- th-general-176 -> retired
- th-general-199 -> retired
- th-office-025 -> retired
- th-office-050 -> retired
- th-food-032 -> retired
- th-food-034 -> retired
- th-food-038 -> retired
- th-animal-001 -> retired
- th-animal-004 -> retired
- th-animal-006 -> retired
- th-animal-009 -> retired
- th-animal-011 -> retired
- th-animal-013 -> retired
- th-animal-014 -> retired
- th-animal-031 -> retired
- th-animal-035 -> retired
- th-animal-043 -> retired
- th-animal-044 -> retired
- th-animal-046 -> retired
- th-animal-055 -> retired
- th-animal-065 -> retired
- th-animal-067 -> retired
- th-animal-078 -> retired
- th-animal-081 -> retired
- en-general-002 -> retired
- en-general-007 -> retired
- en-general-010 -> retired
- en-general-011 -> retired
- en-general-013 -> retired
- en-general-016 -> retired
- en-general-017 -> retired
- en-general-019 -> retired
- en-general-020 -> retired
- en-general-021 -> retired
- en-general-024 -> retired
- en-general-025 -> retired
- en-general-027 -> retired
- en-general-028 -> retired
- en-general-032 -> retired
- en-general-036 -> retired
- en-general-039 -> retired
- en-general-041 -> retired
- en-general-042 -> retired
- en-general-043 -> retired
- en-general-045 -> retired
- en-general-046 -> retired
- en-general-047 -> retired
- en-general-050 -> retired
- en-general-052 -> retired
- en-general-053 -> retired
- en-general-054 -> retired
- en-general-055 -> retired
- en-office-084 -> retired
- en-office-085 -> retired
- en-office-099 -> retired
- en-office-112 -> retired
- en-office-114 -> retired
- en-food-001 -> retired
- en-food-005 -> retired
- en-food-019 -> retired
- en-food-021 -> retired
- en-food-023 -> retired
- en-food-044 -> retired
- en-food-045 -> retired
- en-food-058 -> retired
- en-food-068 -> retired
- en-food-074 -> retired
- en-food-075 -> retired
- en-food-076 -> retired
- en-food-077 -> retired
- en-food-078 -> retired
- en-food-081 -> retired
- en-food-083 -> retired
- en-food-084 -> retired
- en-food-085 -> retired
- en-animal-002 -> retired
- en-animal-005 -> retired
- en-animal-006 -> retired
- en-animal-014 -> retired
- en-animal-026 -> retired
- en-animal-040 -> retired
- en-animal-041 -> retired
- en-animal-042 -> retired
- en-animal-043 -> retired
- en-animal-051 -> retired
- en-animal-054 -> retired
- en-animal-058 -> retired
- en-animal-060 -> retired
- en-animal-062 -> retired
- en-animal-064 -> retired
- en-animal-068 -> retired
- en-animal-069 -> retired
- en-animal-070 -> retired
- en-animal-073 -> retired
- en-animal-075 -> retired
- en-animal-076 -> retired
- en-animal-081 -> retired
- en-animal-082 -> retired
- en-animal-083 -> retired

## Skipped: pool moves (11)

Contract blocks the retire-and-append move: the spec says a word's text is unique within its language, and the oracle counts retired words too (a probe copy with the appended entries reds on text uniqueness for the 8 moves, and only for those). The moved words therefore stay where they are, unchanged. Needs an owner ruling: let the uniqueness check skip retired words, or leave the pools as they are.

- th-office-080 -> pool move to general SKIPPED (stays in its original pool)
- th-office-081 -> pool move to general SKIPPED (stays in its original pool)
- th-office-082 -> pool move to general SKIPPED (stays in its original pool)
- en-office-059 -> pool move to general SKIPPED (stays in its original pool)
- en-office-070 -> pool move to general SKIPPED (stays in its original pool)
- en-office-071 -> pool move to general SKIPPED (stays in its original pool)
- en-office-114 -> pool move to general not appended: the word is on the retire list
- en-office-115 -> pool move to general SKIPPED (stays in its original pool)
- en-animal-067 -> pool move to general SKIPPED (stays in its original pool)
- en-animal-068 -> pool move to general not appended: the word is on the retire list
- en-animal-070 -> pool move to general not appended: the word is on the retire list

## Notes

- wordType ambiguity (a word with two common word types): the schema has no value for it and the English bank admits single-type words only, so the word is retired.
- en-office-100 and en-office-101: the reviewers named different cells (one the word type, the other the syllable count), so only the syllables claim, which carries the labelled reason, is applied. The word-type claim (adjective and noun) has no second reviewer: left for the owner list, words stay active.
- en-general-016 and en-office-085: also on the retire list; their syllables cell is set to null with the family dropped, and the word is retired.
