---
title: "Master Image Prompt Registry — วัดดวง"
target_model: "gpt-image-2"
total_images: 10
last_updated: 2026-09-18
schema_version: "4.0"
brand_block: |
  Style/medium: FLAT EDITORIAL VECTOR ILLUSTRATION — large simple areas of flat color, a single clean ink outline of even weight, at most two flat shade tones per area, no gradients, no airbrushing, no glossy highlights, no rendered individual hair strands. NOT anime, NOT manga, NOT manhwa, NOT webtoon, NOT comic-book art, NOT photorealistic, NOT 3D. Think a modern printed magazine spot illustration, not a character sheet.
  Color palette: warm ink (#1a1a1a) linework; warm paper cream (#fff8e8) and muted grey (#6b7280) for neutrals; rose (#d6336c), warm gold (#ffd27f), sky (#7fd8e8) and coral (#f89880) used sparingly, as clothing and accent colors only.
  Composition/framing: single-subject chest-up portrait, three-quarter turn, centred with even margin, square 1:1 aspect, isolated on a fully transparent background. The occupation must be readable from what the subject wears or carries — worn or held low, never crossing the face. The manner must be readable from expression and posture alone.
  Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO alcohol of any kind, NO bottles, NO cans, NO drinking glasses. NO text, NO letters, NO numbers, NO logos, NO brand marks, NO watermarks. NO suggestive framing, NO revealing clothing. Every subject is an unmistakable adult. Not a real or identifiable person — an invented character. NO ethnic, national or religious markers of any kind.
---

# Master Image Prompt Registry

Generated-art provenance, per `docs/agents/assets.md`. Created by gh#102 — the first ten
เนื้อคู่ portraits. Cards are `docs/copy/nuea-khu/cards.md`; ids here map one-to-one onto the
card ids in that file.

## Brand reference

| Element | Value |
|---|---|
| Ink | `#1a1a1a` |
| Paper | `#fff8e8` |
| Primary | `#d6336c` |
| Accents | `#ffd27f` · `#7fd8e8` · `#f89880` |
| Muted | `#6b7280` |
| Style baseline | "flat editorial vector illustration, even ink outline, flat color areas, not anime, not photorealistic" |
| Forbidden subjects | "alcohol, bottles, cans, drinking glasses, text, logos, minors, suggestive framing, real people, ethnic markers" |
| Text inside image | "none — these carry no labels" |
| Style anchor | `images/IMG_01_001.png` |

## Status — owner sign-off is PENDING

All ten are rendered, transparency-verified and reviewed by the agent; `status: approved` here means
the agent looked at the PNG, per the image skill's own definition. **It does not mean owner approval.**
gh#102 closes only when the ten are put to the owner and their answer is recorded.

Open against the set as a whole, for that decision:

- **Hair reads near-identical across all ten** — dark brown wavy, same treatment. Ten people who look
  like variants of two faces. The most likely reason to re-render.
- **Age does not differentiate.** F5 is 41 and M4 is 38; nearly every card reads late-20s/early-30s.
- **Occupation is wardrobe-only on four** — M4, F3, F4, F5. Nothing in the crop names the job. The six
  with a uniform or a held object (M1, M2, M3, M5, F1, F2) read correctly.
- **Marks are sub-legible at card size** on the six that carry a small facial or hand mark. They are
  present in the master; they disappear on downscale.
- **Criterion 3 cannot be closed at all** — it grades "at the size the canvas specifies" and there is
  no canvas: `docs/copy/nuea-khu.md` ships the portrait box empty and no เนื้อคู่ route exists under
  `src/pages/`. The proof was judged at 256px as a stand-in, which is an assumption, not the criterion.

## The as-sent prompts live in a second file

`prompt:` below is the prompt this registry **sent**. Codex wrapped each one with its own preamble
(use case, asset type, reference policy) before calling the image tool, so for the nine batch entries
the registry text is not byte-identical to what the model received. The as-sent text is recorded in
[`portrait-generation-prompts.json`](./portrait-generation-prompts.json), written by Codex during the
run, not by hand. Read both together for criterion 5.

Two things that file says which are no longer true of the PNGs on disk: it reports "copied without
pixel processing" and 1254x1254, both taken before the haze-clearing and trim pass here. It also logs
`IMG_01_002` twice — Codex retried that one render.

## Rules this set is held to

- **Nationality is never rendered.** `docs/copy/nuea-khu.md` states nationality is text and never
  decides what a face looks like, and that no distinguishing mark may reference ethnicity. No prompt
  here names a nationality or an ethnic cue.
- **Criterion 1 grades occupation and manner** (gh#102). Every prompt carries both as something
  visible — occupation through clothing, manner through expression and posture.
- **Weight is not a field.** Build is rendered; weight is not inferred.
- Three cards (M3, M5, F2) carry marks on a hand or wrist. Those entries raise one hand naturally
  into frame so the mark is renderable without leaving the portrait crop.
- These stay outside `public/`. `public/` is a publish surface and ships verbatim.

---

# เนื้อคู่ portraits — first ten (gh#102)

```yaml
- id: IMG_01_001
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card M1"
  api_call:
    model: "gpt-image-2"
    size: "1024x1024"
    quality: "high"
  purpose: "Card M1 — music teacher, quiet but smiles easily."
  prompt: |
    Scene: standalone character portrait for a one-person fortune-telling web card, isolated
    subject, fully transparent background.

    Subject: a man of 29, tall and slim, a music teacher of modest steady means — quiet, but
    smiling easily and openly, the look of someone humming while thinking.

    Key details:
      - chest-up, three-quarter turn, relaxed shoulders
      - a small scar through the outer end of the left eyebrow, subtle but readable
      - plain soft-collar shirt in muted sky (#7fd8e8), no pattern
      - a plain canvas instrument strap over one shoulder as the occupation cue, the instrument
        itself out of frame below the crop
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO instrument body in frame, NO props crossing the face, NO printed music, NO notation.
  status: "approved"
  notes: "Rendered + reviewed. Occupation cue = shoulder strap. Eyebrow scar present but sub-legible at card size."
  output_path: "images/IMG_01_001.png"
```

```yaml
- id: IMG_01_002
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card M2"
  api_call:
    model: "gpt-image-2"
    size: "1024x1024"
    quality: "high"
  style_ref: "images/IMG_01_001.png"
  purpose: "Card M2 — dentist with his own clinic, neat to the point of tense."
  prompt: |
    Scene: standalone character portrait for a one-person fortune-telling web card, isolated
    subject, fully transparent background.

    Subject: a man of 34, solidly built and well-proportioned, a dentist who owns his clinic and
    is comfortable — so tidy he reads as faintly tense, posture a little too straight.

    Key details:
      - chest-up, three-quarter turn, squared shoulders, closed polite smile
      - a single mole below the right eye
      - clean clinical tunic with a soft stand collar, warm paper cream (#fff8e8)
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO dental tools, NO mask, NO gloves raised to the face.
  status: "approved"
  notes: "Rendered + reviewed. DEFECT: card build is solid/well-proportioned; render reads lean. Mole sub-legible at card size."
  output_path: "images/IMG_01_002.png"
```

```yaml
- id: IMG_01_003
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card M3"
  api_call:
    model: "gpt-image-2"
    size: "1024x1024"
    quality: "high"
  style_ref: "images/IMG_01_001.png"
  purpose: "Card M3 — bicycle repairman, direct and blunt. Hand in frame for the palm callus."
  prompt: |
    Scene: standalone character portrait for a one-person fortune-telling web card, isolated
    subject, fully transparent background.

    Subject: a man of 27, short and muscular, a bicycle repairman with his own small shop, getting
    by — direct and blunt, meeting the viewer's eye without softening it.

    Key details:
      - chest-up, three-quarter turn, right hand raised open near the chest
      - a worn callus visible across the right palm
      - sleeves rolled, sturdy work apron over a plain tee in muted grey (#6b7280)
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO bicycle, NO tools, NO grease smears on the face.
  status: "approved"
  notes: "Rendered + reviewed. Occupation and manner both strong. Palm callus sub-legible at card size."
  output_path: "images/IMG_01_003.png"
```

```yaml
- id: IMG_01_004
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card M4"
  api_call:
    model: "gpt-image-2"
    size: "1024x1024"
    quality: "high"
  style_ref: "images/IMG_01_001.png"
  purpose: "Card M4 — corporate accountant, calmer than his peers."
  prompt: |
    Scene: standalone character portrait for a one-person fortune-telling web card, isolated
    subject, fully transparent background.

    Subject: a man of 38, tall and lean, a corporate accountant on secure footing — visibly calmer
    and more unhurried than people his age, an even, settled expression.

    Key details:
      - chest-up, three-quarter turn, still and upright posture
      - a single patch of grey hair above the forehead, clearly distinct from the dark hair
      - plain buttoned shirt in muted grey (#6b7280), collar neat
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO notebook, NO pen, NO glasses.
  status: "approved"
  notes: "Rendered + reviewed. Grey forelock present. DEFECT: occupation is wardrobe-only, not legible as accountant."
  output_path: "images/IMG_01_004.png"
```

```yaml
- id: IMG_01_005
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card M5"
  api_call:
    model: "gpt-image-2"
    size: "1024x1024"
    quality: "high"
  style_ref: "images/IMG_01_001.png"
  purpose: "Card M5 — market plant seller, slow but forgets nothing. Wrist in frame for the tattoo."
  prompt: |
    Scene: standalone character portrait for a one-person fortune-telling web card, isolated
    subject, fully transparent background.

    Subject: a man of 31, thin, who sells plants at a weekend market and does modestly — unhurried
    and slow-moving, with the steady look of someone who forgets nothing.

    Key details:
      - chest-up, three-quarter turn, one forearm raised across the chest, wrist visible
      - a small fine-line leaf tattoo on the inner wrist
      - one small potted seedling cradled low at chest level as the occupation cue, well below the face
      - loose open shirt in warm gold (#ffd27f) over a plain tee
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO market stall, NO shelving, NO plant larger than one hand, NOTHING crossing the face.
  status: "approved"
  notes: "Rendered + reviewed. Seedling and wrist tattoo both legible. Strongest occupation cue in the male set."
  output_path: "images/IMG_01_005.png"
```

```yaml
- id: IMG_01_006
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card F1"
  api_call:
    model: "gpt-image-2"
    size: "1024x1024"
    quality: "high"
  style_ref: "images/IMG_01_001.png"
  purpose: "Card F1 — night-shift nurse, kind without saying much."
  prompt: |
    Scene: standalone character portrait for a one-person fortune-telling web card, isolated
    subject, fully transparent background.

    Subject: a woman of 30, slight and slender, a night-shift nurse who gets by on overtime —
    kind in a quiet way that does not need words, a little tired around the eyes.

    Key details:
      - chest-up, three-quarter turn, softened shoulders
      - a small mole at the centre of the chin
      - plain scrub top in muted sky (#7fd8e8), soft V neckline
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO stethoscope, NO medical equipment, NO ID badge.
  status: "approved"
  notes: "Rendered + reviewed. Scrubs read as nurse; chin mole legible."
  output_path: "images/IMG_01_006.png"
```

```yaml
- id: IMG_01_007
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card F2"
  api_call:
    model: "gpt-image-2"
    size: "1024x1024"
    quality: "high"
  style_ref: "images/IMG_01_001.png"
  purpose: "Card F2 — small coffee-shop owner, talkative. Hand in frame for the scar."
  prompt: |
    Scene: standalone character portrait for a one-person fortune-telling web card, isolated
    subject, fully transparent background.

    Subject: a woman of 33, well-proportioned, who owns a small coffee shop and is comfortable
    enough — mid-conversation, warm and animated, the face of someone who remembers every name.

    Key details:
      - chest-up, three-quarter turn, left hand raised lightly near the shoulder, back of the hand toward the viewer
      - a faint pale scar across the back of the left hand
      - work apron over a plain shirt, apron in coral (#f89880)
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO cups, NO mugs, NO drinking vessels of any kind, NO coffee equipment.
  status: "approved"
  notes: "Rendered + reviewed. Apron reads as shopkeeper. Hand scar sub-legible at card size."
  output_path: "images/IMG_01_007.png"
```

```yaml
- id: IMG_01_008
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card F3"
  api_call:
    model: "gpt-image-2"
    size: "1024x1024"
    quality: "high"
  style_ref: "images/IMG_01_001.png"
  purpose: "Card F3 — architect, argues well but holds no grudge."
  prompt: |
    Scene: standalone character portrait for a one-person fortune-telling web card, isolated
    subject, fully transparent background.

    Subject: a woman of 36, tall and slim, an architect on secure footing — sharp and ready to
    argue, but with no edge of grudge in it; an amused, engaged expression.

    Key details:
      - chest-up, three-quarter turn, chin slightly raised, one eyebrow a touch higher
      - eyes of two clearly different colours, one warm brown and one pale grey-green
      - simple structured shirt in warm paper cream (#fff8e8), sleeves crisp
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO drawings, NO rulers, NO architectural models.
  status: "approved"
  notes: "Rendered + reviewed. DEFECT: occupation wardrobe-only. Heterochromia sub-legible at card size."
  output_path: "images/IMG_01_008.png"
```

```yaml
- id: IMG_01_009
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card F4"
  api_call:
    model: "gpt-image-2"
    size: "1024x1024"
    quality: "high"
  style_ref: "images/IMG_01_001.png"
  purpose: "Card F4 — kindergarten teacher, loud and laughs easily."
  prompt: |
    Scene: standalone character portrait for a one-person fortune-telling web card, isolated
    subject, fully transparent background.

    Subject: a woman of 26, petite, a kindergarten teacher on a low income who is plainly untroubled
    by it — loud, mid-laugh, the most openly cheerful face in the set.

    Key details:
      - chest-up, three-quarter turn, head tilted back a little in a real laugh
      - one upper front tooth slightly overlapping its neighbour, visible in the open smile
      - bright simple blouse in rose (#d6336c)
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO children, NO classroom, NO toys.
  status: "approved"
  notes: "Rendered + reviewed. Manner strongest in the set. DEFECT: occupation wardrobe-only; overlapping tooth sub-legible."
  output_path: "images/IMG_01_009.png"
```

```yaml
- id: IMG_01_010
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card F5"
  api_call:
    model: "gpt-image-2"
    size: "1024x1024"
    quality: "high"
  style_ref: "images/IMG_01_001.png"
  purpose: "Card F5 — freelance translator, quiet but hard to stop once started."
  prompt: |
    Scene: standalone character portrait for a one-person fortune-telling web card, isolated
    subject, fully transparent background.

    Subject: a woman of 41, full-figured, a freelance translator whose income is irregular but
    liveable — quiet and self-contained, on the edge of saying something at length.

    Key details:
      - chest-up, three-quarter turn, composed and still
      - a fringe with one lock that clearly refuses to sit with the rest
      - soft draped top in muted grey (#6b7280)
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO books, NO paper, NO screens.
  status: "approved"
  notes: "Rendered + reviewed. Build and fringe both legible. DEFECT: occupation wardrobe-only; reads younger than 41."
  output_path: "images/IMG_01_010.png"
```
