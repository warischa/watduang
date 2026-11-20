# Thai word list: review of the `vowels` cell

You are one of two independent reviewers. Neither sees the other's work.

## What you get

`input-th.tsv`, tab-separated, with a header row: `id`, `pool`, `word`, `vowels`. One row per Thai word.
`vowels` holds the stored cell: the vowel forms joined with `|`. An empty `vowels` cell means the stored
cell lists no form.

## What you judge

For every row, decide whether the `vowels` cell lists **exactly** the vowel forms that are written in the
word:

- every written form is listed, none is left out;
- forms are in order of first appearance in the written word;
- each form is listed once;
- only forms from the list below are used, and a compound form is listed as that one form, never split
  into smaller parts;
- no form is listed that the word does not write.

Judge from Thai orthography only, as the word is written. Pronunciation matters only to decide which
written form a letter is acting as (see the traps).

## The form list

A hyphen stands for the consonant slot. This is the full current list:

Forms: -ะ -ั -า -ำ -ิ -ี -ึ -ื -ุ -ู -อ -็อ -ัว -ัวะ เ- เ-ะ เ-็ แ- แ-ะ แ-็ โ- โ-ะ ใ- ไ- เ-า เ-าะ เ-อ เ-ิ เ-อะ เ-ีย เ-ียะ เ-ือ เ-ือะ -ือ -ว เ-ย -รร

## Definitions (copied from the project's design spec)

> **Written form.** Every attribute is defined by how the word is WRITTEN.
>
> `vowels` (TH): Written vowel forms from the form list, in order of first appearance. An inherent vowel
> that is pronounced but not written is never listed, so ขนม has none.
>
> A vowel form is placed when its characters appear in the word contiguous and in order, the hyphen
> standing for one or more consonants (a cluster fills the slot), with tone marks and U+0E47 allowed
> inside the span. A form spelled with no vowel sign, and open -ือ, also carries a context rule: -ว must
> be followed by a consonant; -ือ cannot start its slot right after เ or after เ and one consonant; -อ
> cannot start its slot right after เ; -อ and -รร must end bare (the word ends, or a consonant or a
> leading vowel follows).

Placement is a necessary condition for listing a form, not a sufficient one: a form can be placeable in a
word and still not be one of the forms the word writes. You decide that.

## Known traps

- **ว as a consonant.** In อวกาศ the ว is a consonant, so `-ว` is not listed. The same holds for ว ending
  a word or followed by a vowel, and for ว closing the syllable as a final consonant (ดาว, แมว).
- **`-ัว` and `-ว` are two different forms.** When ั is written with ว (หัว, ตัว) the form is `-ัว`. When
  the vowel is written with ว alone and a final consonant follows (หมวก, ม้วน) the form is `-ว`. Never
  list both for one syllable.
- **Two readings of the same letters.** Some letters can be a consonant or part of a vowel (อ, ว, ย, ร).
  If a word has two accepted readings, judge the cell against the reading most common for that word and
  say in `reason` that it has two.
- **Open `-ือ` versus `เ-ือ`.** The form after เ is `เ-ือ`, never `เ-` plus `-ือ`. A second, separate ือ
  elsewhere in the word is `-ือ`.
- **Compounds are one form.** `เ-ีย`, `เ-ือ`, `เ-า`, `เ-าะ`, `-ัว`, `เ-็`, `แ-็`, `-็อ` and the other
  forms in the list are written as one unit each.
- **Several syllables.** A compound word lists the forms of all its syllables, each form once, in order
  of first appearance.

## Output

Print **only the rows you disagree with**, as TSV with no header and exactly 5 tab-separated columns:

`id`, `vowels`, `stored`, `proposed`, `reason`

- `id`: the row's id, exactly as in the input.
- `vowels`: the literal word `vowels`.
- `stored`: the cell as given in the input (empty if it was empty).
- `proposed`: the cell you say is right, forms joined with `|`, only forms from the list above. If the
  right cell lists no form, leave `proposed` empty (two tabs in a row).
- `reason`: one short line, no tab and no line break.

Do not print agreeing rows, a header, or commentary. One row per disagreement, at most one row per id. If
you disagree with nothing, print nothing. After the TSV, on a final separate line, print
`# coverage: N of M` (N rows you judged, M rows in the input). Lines that start with `#` are read as
comments.

## Do not

Do not read `src/prize-words/**`, any file under `docs/verification/evidence/` other than `input-th.tsv`
and this file, or any script. Judge from the input and your knowledge of Thai writing only.
