---
title: "Master Image Prompt Registry — วัดดวง"
target_model: "gpt-image-2"
total_images: 53
last_updated: 2026-10-01
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

**What actually rendered these, since criterion 5 asks for the model.** Not the `api_call.model`
field below — that is a transport-B field and the image skill states transport A ignores it entirely.
These went through Codex's built-in `image_gen` tool, which reports no model id; the skill's own dated
note infers ChatGPT Images 2.5. Codex's log records `"tool": "built-in image_gen"`, which is the
accurate record. Treat the `api_call.model` field as registry scaffolding, not as a claim about what ran.

**Transparency, measured rather than eyeballed.** Alpha means 0.53-0.62, all ten `srgba`. The residual
1-25 alpha band (483-1349 px per file) was tested for what it actually is: dilating the solid mask by
4px and counting band pixels outside it returns **0 on all ten**, so every residual pixel sits on the
subject's own edge and none is stray background haze. Criterion 2's haze half is **confirmed**, not
inferred — a look at 256px could not have decided this, because those pixels are invisible there
whether they are edge or haze. Corners: nine files carry four fully transparent corners; `IMG_01_002`
carries alpha 66 and 76 in its two bottom corners, which is its shoulder meeting the crop line after
trim, not haze.

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

**Superseded in the deck by `IMG_01_041`-`IMG_01_050`** (owner ruling 2026-09-23, recorded in the gh#103
section below). These files are kept: they are gh#102's accepted record and the references the thirty
were rendered from.

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

---

# เนื้อคู่ portraits — the remaining thirty (gh#103)

Cards M6–M20 are `docs/copy/nuea-khu/cards-m6-m20.md` and F6–F20 are
`docs/copy/nuea-khu/cards-f6-f20.md`, all `UNREVIEWED`. They are rendered before sign-off under the
owner ruling in gh#103 comment `5788443062`, which also carries the re-render trigger and the probe's
pass definition.

**These did NOT go through the same transport as the ten.** They go through the Alibaba token plan
(`qwen-image` skill, which the owner named) on `qwen-image-3.0-pro`, and they are **chroma-keyed**:
that model returns no alpha (measured in `docs/agents/assets.md`; its documentation has no
transparent-background parameter), so each prompt asks for a flat `#00FF00` ground that is keyed
out afterwards. Probe 1 went through `wan2.7-image-pro` with a transparent URL reference and came back
with a painted checkerboard and a visible seam — result in gh#103 comment `5788527430`.

How these differ from the rest of this registry, so the fields below are read correctly:

- **`brand_block: false`** — the front matter's brand block is NOT appended; its transparent-background
  lines contradict the green ground. The brand block's style, palette and content constraints are
  folded into each entry's own text instead.
- **`reference_images` are three accepted portraits**, flattened onto `#00FF00` and capped at 768px
  (`ref_flatten`), sent as Base64. `api_call` is sent verbatim, so here `api_call.model` IS what ran.
- **`key_prep` is the post-processing** that turns the raw render into the cutout in `images/`; it is the
  skill's `scripts/chroma_key.sh`.
- **`status: "approved"` means agent-reviewed, as for the ten. The owner ACCEPTED all forty deck
  portraits, `IMG_01_011`-`IMG_01_050`, on 2026-09-23 (popup), with the kept defects listed below
  named in the option chosen.** That accepts the renders, not the card copy: all forty cards stay
  `UNREVIEWED`, and an edit that moves a card's visual field still invalidates its portrait. Box 3 of
  gh#103 — whether a reviewer can tell the batches apart — was not asked and stays the owner's.

**How they were rendered, and how to re-render one.** The probe and the first pass of the
twenty-nine went through a session wrapper around the skill's own key lookup, endpoint and download,
because the skill then took URL references only. The same day the skill gained Base64 local refs,
`ref_flatten`, `style_preamble` / `shared_constraints` / `brand_block: false`, and `chroma_key.sh`; it was
checked to compose byte-identical text for all thirty entries and pixel-identical flattened
references for all six reference files, and every re-render and all ten of the re-rendered first ten went through its registry
mode. So any of these renders again with:

    python3 ~/.claude/skills/qwen-image/scripts/qwen_image.py --registry images/IMAGES.md --id <id> --no-fallback
    ~/.claude/skills/qwen-image/scripts/chroma_key.sh images/<id>.png images/<id>.png

(`--no-fallback`, because a fallback to wan would change the model silently.) Raw renders are not kept.
`--validate` over this whole registry reports `IMG_01_001`-`010` invalid by design — their `1024x1024`
size is gh#102's Codex format, not this API's; every gh#103 entry validates.

**The first ten, re-rendered into this pipeline — owner ruling 2026-09-23.** Put the join above to
the owner (popup); the owner chose to re-render the ten rather than accept it, reversing the
2026-09-22 decline now that the join existed to weigh. They are **new ids, `IMG_01_041`-`IMG_01_050`,
one per card M1-M5 and F1-F5 (`supersedes:` names the old id)**, not overwrites: `IMG_01_001`-`010`
stay on disk as gh#102's record — its comments cite those files — and as the references the thirty
were rendered from, so the thirty stay reproducible. The deck's forty are `IMG_01_011`-`IMG_01_050`.
Their references come from the thirty, matched by gender and manner (`&warm_m`, `&serious_m`,
`&warm_f`, `&serious_fn`). Hair is chosen per card to break the ten's sameness; it is not a card field
and the owner can overrule any of it. Two cues changed because the key would erase green: M5's
seedling is a blue-grey succulent, and F3's second eye is grey-blue, not grey-green.

**Open against the deck's forty (`IMG_01_011`-`IMG_01_050`), for the owner's review:**

- **One pipeline now.** The join the owner weighed — the thirty varying in hair and reading their
  ages where gh#102's ten did not — is what the re-render of the ten answers. Whether a reviewer can
  still tell batches apart is box 3, and the owner's.
- **References leak more than style.** Found in this run, each fixed by re-rendering on a different
  trio: expression, a scar, freckles, gender, a whole outfit (M6's cook's jacket onto M2, F9's wrap
  cardigan onto F4) and a gesture (a raised fist). The no-copied-marks line did not stop the freckles.
- **Fully transparent 30.5%-44.9% across the forty** (gh#102's ten: 36.7%-46.5%); every file has alpha 0
  in both top corners. Deck weight: 29,098,190 bytes for the forty files.
- **Constraint misses kept, not fixed:** F15's small gold wings pin survived three renders; M19 wears a
  blank name tag; M5's, M9's and M20's raised hands are fists. None carries text or a logo.
- **Marks not legible** on M9, M10, M18, M20, F2, F13 and F17; occupation wardrobe-only on M2 and M4 —
  per entry below.

```yaml
- id: IMG_01_011
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-m6-m20.md — card M6"
  api_call:
    model: "qwen-image-3.0-pro"
    size: "1024*1024"
    n: 1
    seed: 20260923
    prompt_extend: false
    watermark: false
    negative_prompt: "smiling, grin, facial scar, eyebrow scar, green clothing, green on the person, shadow, gradient background, textured background, checkerboard, text, letters, logo, watermark, anime, manga, photorealistic, 3D render, glossy highlights, more than one person"
  reference_images: ["images/IMG_01_003.png", "images/IMG_01_004.png", "images/IMG_01_010.png"]
  ref_flatten: "#00FF00"
  brand_block: false
  key_prep: "sample the 8x8 top-left corner as the key colour; -fuzz 20% -transparent it; despill -channel G -fx 'min(g, max(r,b))' (safe: no palette colour is green-dominant); -channel A -morphology Erode Disk:1 -blur 0x0.7 -level 50%,100% (drops the despilled rim, softens the edge); -trim +repage"
  purpose: "Card M6 — cook who owns a curry-and-rice shop, stern face but soft-hearted. The gh#103 probe (probe 2)."
  prompt: |
    Image 1, Image 2 and Image 3 are STYLE references only. Draw ONE new person in exactly their
    illustration style: flat editorial vector illustration, a single clean dark ink outline of even
    weight, large flat colour areas with at most two flat shade tones, the same simplified face
    construction and eye shape, the same skin colour treatment, and hair drawn as flat dark shapes
    with no individual strands. Do not copy any reference person's face, clothing or pose, and do not
    copy any of their scars, moles, marks or tattoos: the ONLY mark on this person is the one named
    in Key details, and the face and eyebrows carry no mark at all.

    Scene: a single-subject chest-up character portrait for a fortune-telling web card, three-quarter
    turn, centred with an even margin, square frame, on a completely flat, uniform pure green (#00FF00)
    background — one solid colour edge to edge, exactly like the references' ground: no shadow, no
    gradient, no texture, no floor, no checkerboard.

    Subject: a man of 44, stocky and heavy-set, a cook who runs his own small curry-and-rice shop and
    gets by comfortably — stern at first glance: NOT smiling, mouth set in a flat straight line, brows
    slightly lowered; the only softness is in the eyes, which are kinder than the mouth.

    Key details:
      - chest-up, three-quarter turn, right hand raised loosely near the chest, back of the hand toward the viewer
      - a small, faint, pale burn mark on the back of the right hand — subtle, not a wound
      - plain white double-breasted cook's jacket, a folded kitchen towel over one shoulder as the occupation cue
      - warm ink (#1a1a1a) linework; warm paper cream (#fff8e8) and muted grey (#6b7280) neutrals;
        rose (#d6336c), warm gold (#ffd27f), sky (#7fd8e8) and coral (#f89880) only as small accents

    Constraints: NO green anywhere on the person or the clothing. NO pots, NO pans, NO knives, NO food,
    NO steam, NOTHING crossing the face. NO alcohol, NO bottles, NO cans, NO drinking glasses. NO text,
    NO letters, NO numbers, NO logos, NO brand marks, NO watermarks. NOT anime, NOT manga, NOT
    photorealistic, NOT 3D, no glossy highlights. An unmistakable adult and an invented person, not a
    real one. NO ethnic, national or religious markers of any kind.
  status: "approved"
  notes: "Probe 4 of 4, agent-reviewed. Probe 2 (refs 001/004/010) matched the set but copied M1's eyebrow scar and smiled; probe 3 added the no-copied-marks line and the not-smiling line and the scar went, the smile stayed; probe 4 swapped the smiling 001 for the unsmiling 003 and the manner read stern — so the references' expressions leak into the render. Keyed: 39.0% fully transparent, corners alpha 0. Burn mark faint and legible. DEFECT: reads younger than 44, as the ten's age defect predicts."
  output_path: "images/IMG_01_011.png"
```

**The twenty-nine after the probe** share their style paragraph, scene and standing constraints
through YAML anchors (`style_preamble`, `shared_constraints`), so the text sent for each is
`style_preamble` + `prompt` + `shared_constraints`, in that order, verbatim. The probe showed a
reference's expression leaks into the render, so each card takes the trio that matches its manner:
`&warm` (`IMG_01_001` smiling, `IMG_01_007` animated, `IMG_01_009` laughing) or `&serious`
(`IMG_01_003` blunt, `IMG_01_004` calm, `IMG_01_010` composed). **Gender leaks the same way:** on the
mixed `&serious` trio, two men and one woman, three of the nine serious female cards came back
reading as men, so those three (F8, F14, F20) were re-rendered on `&serious_f` (`IMG_01_010`,
`IMG_01_008`, `IMG_01_006`, all women) and read correctly. The negative prompt carries no smile or
scar terms here — several cards need a smile or a facial mark. No card is dressed in green: the key
would erase it, which matters most for the ranger (F17), whose uniform would normally be green.

```yaml
- id: IMG_01_012
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-m6-m20.md — card M7"
  api_call: &api
    model: "qwen-image-3.0-pro"
    size: "1024*1024"
    n: 1
    seed: 20260923
    prompt_extend: false
    watermark: false
    negative_prompt: "green clothing, green on the person, shadow, gradient background, textured background, checkerboard, text, letters, logo, watermark, anime, manga, photorealistic, 3D render, glossy highlights, more than one person"
  reference_images: &warm ["images/IMG_01_001.png", "images/IMG_01_007.png", "images/IMG_01_009.png"]
  ref_flatten: &flat "#00FF00"
  brand_block: false
  key_prep: &key "as IMG_01_011"
  style_preamble: &pre |
    Image 1, Image 2 and Image 3 are STYLE references only. Draw ONE new person in exactly their
    illustration style: flat editorial vector illustration, a single clean dark ink outline of even
    weight, large flat colour areas with at most two flat shade tones, the same simplified face
    construction and eye shape, the same skin colour treatment, and hair drawn as flat dark shapes
    with no individual strands. Do not copy any reference person's face, expression, clothing or pose,
    and do not copy any of their scars, moles, marks or tattoos: the ONLY mark on this person is the
    one named in Key details.

    Scene: a single-subject chest-up character portrait for a fortune-telling web card, three-quarter
    turn, centred with an even margin, square frame, on a completely flat, uniform pure green (#00FF00)
    background — one solid colour edge to edge, exactly like the references' ground: no shadow, no
    gradient, no texture, no floor, no checkerboard.
  shared_constraints: &post |
    Standing constraints: NO green anywhere on the person or the clothing. NOTHING crossing the face.
    NO alcohol, NO bottles, NO cans, NO drinking glasses. NO text, NO letters, NO numbers, NO logos,
    NO brand marks, NO watermarks. NOT anime, NOT manga, NOT photorealistic, NOT 3D, no glossy
    highlights. NO suggestive framing, NO revealing clothing. An unmistakable adult and an invented
    person, not a real one. NO ethnic, national or religious markers of any kind.
  prompt: |
    Subject: a man of 26, tall and slim, who coaches children's swimming on a modest income —
    cheerful and chatty, an open, friendly face caught mid-hello.

    Key details:
      - chest-up, three-quarter turn, relaxed open posture
      - a short thin scar on the chin
      - a plain athletic polo shirt in sky (#7fd8e8), a whistle on a lanyard around the neck as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO water, NO pool, NO swimsuit, NO goggles.
  status: "approved"
  notes: "Agent-reviewed. Whistle and polo read; chin scar legible; cheerful."
  output_path: "images/IMG_01_012.png"

- id: IMG_01_013
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-m6-m20.md — card M8"
  api_call: *api
  reference_images: *warm
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 52, well-proportioned, a barber who has run his own small shop in a side street
    for twenty years and gets by — good-humoured, caught mid-story, amused eyes.

    Key details:
      - chest-up, three-quarter turn, easy posture
      - fully white hair, cut short and very tidy — clearly white all over, not grey streaks; the face reads fifty-two, with light lines at the eyes
      - a barber's smock in muted grey (#6b7280), a comb tucked in the breast pocket as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO scissors, NO razor, NO mirror, NO chair.
  status: "approved"
  notes: "Agent-reviewed. White hair and comb read; the face reads fifties."
  output_path: "images/IMG_01_013.png"

- id: IMG_01_014
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-m6-m20.md — card M9"
  api_call: *api
  reference_images: &serious ["images/IMG_01_003.png", "images/IMG_01_004.png", "images/IMG_01_010.png"]
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 33, big, broad and powerfully built, a boxing coach whose income depends on how
    many students he has — surprisingly polite and gentle for his size, a courteous small nod.

    Key details:
      - chest-up, three-quarter turn, one hand raised calmly near the chest, not a fist
      - the bridge of the nose slightly crooked
      - both hands wrapped in plain cloth hand wraps as the occupation cue; a plain training tee in coral (#f89880)
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO boxing gloves, NO ring, NO fighting pose, NO fist toward the viewer, NO blood, NO bruises, NO flags or emblems.
  status: "approved"
  notes: "Agent-reviewed. Hand wraps read. DEFECT: one wrapped hand is a fist at the chest despite 'not a fist'; the crooked nose is not legible."
  output_path: "images/IMG_01_014.png"

- id: IMG_01_015
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-m6-m20.md — card M10"
  api_call: *api
  reference_images: *serious
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 41, thin, a watch repairer of modest steady means — slow-spoken, thinking before
    every word, a considered, patient expression.

    Key details:
      - chest-up, three-quarter turn, still and upright
      - thick straight eyebrows that very nearly meet in the middle
      - a jeweller's loupe hanging on a cord around the neck as the occupation cue; a plain collared shirt in warm paper cream (#fff8e8) under a dark grey work apron
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO watch faces, NO clocks, NO numbers, NO loupe over the eye.
  status: "approved"
  notes: "Agent-reviewed. Loupe and apron read. DEFECT: the brows are thick but do not nearly meet."
  output_path: "images/IMG_01_015.png"

- id: IMG_01_016
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-m6-m20.md — card M11"
  api_call: *api
  reference_images: *serious
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 29, well-proportioned, a firefighter on a steady salary with benefits — brave but
    level-headed, a calm, alert, capable look.

    Key details:
      - chest-up, three-quarter turn, steady shoulders
      - a small crescent-shaped scar on the side of the neck
      - a firefighter's turnout jacket in warm gold (#ffd27f) with plain reflective bands, collar open, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO helmet, NO fire, NO flames, NO smoke, NO badges, NO insignia.
  status: "approved"
  notes: "Agent-reviewed. Turnout jacket reads; the neck scar is present but faint."
  output_path: "images/IMG_01_016.png"

- id: IMG_01_017
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-m6-m20.md — card M12"
  api_call: *api
  reference_images: *serious
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 36, tall and lean, a pilot for a domestic airline, comfortable — confident without
    showing off, a relaxed, assured half-smile.

    Key details:
      - chest-up, three-quarter turn, shoulders back
      - grey hair at the temples, the rest of the hair dark
      - a white pilot's uniform shirt with plain dark epaulettes and a dark tie as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO cap, NO wings badge, NO insignia, NO aircraft.
  status: "approved"
  notes: "Agent-reviewed. Epaulettes and tie read; grey temples legible."
  output_path: "images/IMG_01_017.png"

- id: IMG_01_018
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-m6-m20.md — card M13"
  api_call: *api
  reference_images: *serious
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 47, heavy-set, a carpenter who builds furniture to order and never runs short of
    work — a man of few words, a quiet, steady, capable look.

    Key details:
      - chest-up, three-quarter turn, solid square posture
      - a short salt-and-pepper beard
      - a pencil tucked behind one ear and a canvas work apron in muted grey (#6b7280) over a plain shirt in warm gold (#ffd27f), as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO saws, NO hammers, NO wood planks.
  status: "approved"
  notes: "Agent-reviewed. Pencil behind the ear, apron and salt-and-pepper beard all read."
  output_path: "images/IMG_01_018.png"

- id: IMG_01_019
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-m6-m20.md — card M14"
  api_call: *api
  reference_images: *warm
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 25, thin, a freelance illustrator whose income swings month to month — shy, but
    bright-eyed as if talking about something he loves, a small shy smile.

    Key details:
      - chest-up, three-quarter turn, shoulders a little hunched
      - thick-rimmed dark glasses
      - a paint-smudged canvas smock in warm paper cream (#fff8e8) with small rose and sky smudges, two paintbrushes in its pocket, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO easel, NO canvas, NO drawings, NO paint on the face.
  status: "approved"
  notes: "Agent-reviewed. Glasses, smock and brushes read; shy smile."
  output_path: "images/IMG_01_019.png"

- id: IMG_01_020
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-m6-m20.md — card M15"
  api_call: *api
  reference_images: *serious
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 39, tall and muscular, a civil engineer supervising a construction site, on secure
    footing — serious, with the hint of someone about to laugh at a joke.

    Key details:
      - chest-up, three-quarter turn, upright and broad
      - a single dimple in the right cheek
      - a high-visibility safety vest in warm gold (#ffd27f) with plain reflective bands over a plain shirt in sky (#7fd8e8), as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO hard hat, NO text on the vest, NO buildings, NO cranes, NO tools.
  status: "approved"
  notes: "Agent-reviewed. Hi-vis vest reads; the dimple is present but faint."
  output_path: "images/IMG_01_020.png"

- id: IMG_01_021
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-m6-m20.md — card M16"
  api_call: *api
  reference_images: *serious
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 31, small and slight, a freelance wedding photographer whose income rises and falls
    with the wedding season — observant, quietly watching, eyes that catch every detail.

    Key details:
      - chest-up, three-quarter turn, head tilted slightly as he watches
      - a small hoop earring in the left ear only
      - a camera on a strap around the neck, held low at the chest with the lens pointing down, as the occupation cue; a plain shirt in muted grey (#6b7280)
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO logo or text on the camera, NO lens toward the viewer, NO wedding scene, NO flowers.
  status: "approved"
  notes: "Agent-reviewed. Camera and left-ear hoop read. Minor: the lens faces the viewer."
  output_path: "images/IMG_01_021.png"

- id: IMG_01_022
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-m6-m20.md — card M17"
  api_call: *api
  reference_images: *warm
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 54, well-proportioned, who owns a fruit orchard and is comfortable in a quiet way —
    warm and unhurried, the patient look of someone who teaches without meaning to.

    Key details:
      - chest-up, three-quarter turn, relaxed
      - deep crow's-feet lines at the eyes as he smiles; the face clearly reads mid-fifties
      - a faded cotton bucket hat and a loose work shirt in warm gold (#ffd27f), a pair of pruning shears in the shirt pocket, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO fruit baskets, NO trees, NO scenery, NO conical or woven hat.
  status: "approved"
  notes: "Agent-reviewed. Bucket hat and pruning shears read; crow's feet; the face reads fifties."
  output_path: "images/IMG_01_022.png"

- id: IMG_01_023
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-m6-m20.md — card M18"
  api_call: {<<: *api, seed: 20260924}
  reference_images: *warm
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 28, well-proportioned, a postman on a small but steady salary — smiling a greeting,
    friendly and bright.

    Key details:
      - chest-up, three-quarter turn, a small wave-like lift of the chin
      - noticeably protruding ears
      - a mail satchel strap across the chest, the satchel itself below the crop, over a plain uniform shirt in sky (#7fd8e8), as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO envelopes, NO badges, NO dogs.
  status: "approved"
  notes: "Re-rendered on seed 20260924: the first pass wore a shield badge. Satchel and uniform shirt read. DEFECT: the ears do not read as protruding."
  output_path: "images/IMG_01_023.png"

- id: IMG_01_024
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-m6-m20.md — card M19"
  api_call: *api
  reference_images: *serious
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 43, solidly built, a pharmacist who owns his pharmacy, comfortable — meticulous and
    clear-spoken, the patient look of someone explaining, eyebrows slightly raised.

    Key details:
      - chest-up, three-quarter turn, neat upright posture
      - a broad forehead from a receding hairline
      - a white pharmacist's coat over a plain shirt in sky (#7fd8e8), as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO pills, NO pill bottles, NO medicine boxes, NO badge.
  status: "approved"
  notes: "Agent-reviewed. White coat reads; receding hairline legible. DEFECT: a blank name tag on the coat despite 'NO badge'; it carries no text."
  output_path: "images/IMG_01_024.png"

- id: IMG_01_025
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-m6-m20.md — card M20"
  api_call: *api
  reference_images: *warm
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 35, tall and slim, a vet who treats cats and dogs, on secure footing — gentle, and a
    little awkward with people, a shy, slightly uncertain smile.

    Key details:
      - chest-up, three-quarter turn, left hand raised lightly near the chest, back of the hand toward the viewer
      - several faint thin scratch lines on the back of the left hand
      - a plain scrub top in muted grey (#6b7280) with a few pale cat hairs on it, and a stethoscope around the neck, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO animals, NO other medical tools.
  status: "approved"
  notes: "Agent-reviewed. Stethoscope and scrubs read. DEFECT: the hand scratches are not legible and the raised hand is a fist."
  output_path: "images/IMG_01_025.png"

- id: IMG_01_026
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-f6-f20.md — card F6"
  api_call: *api
  reference_images: *warm
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 28, well-proportioned, a baker who runs her own small bakery and gets by —
    cheerful from before dawn, a bright, easy smile.

    Key details:
      - chest-up, three-quarter turn, hair tied back
      - small freckles across the bridge of the nose
      - a flour-dusted apron in warm gold (#ffd27f) over a plain shirt in warm paper cream (#fff8e8), a little flour on one forearm, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO bread, NO food, NO oven, NO tools, NO headscarf.
  status: "approved"
  notes: "Agent-reviewed. Flour apron reads; freckles legible; cheerful."
  output_path: "images/IMG_01_026.png"

- id: IMG_01_027
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-f6-f20.md — card F7"
  api_call: *api
  reference_images: *serious
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 45, heavy-set, who sells fruit at a morning market and gets by — sharp-tongued but
    kind, a wry, knowing half-smile with one eyebrow up; the face reads mid-forties.

    Key details:
      - chest-up, three-quarter turn, one hand at chest level holding a single mango low
      - a light-brown birthmark on the side of the neck
      - a canvas vendor's apron in coral (#f89880) with a front pouch, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO market stall, NO baskets, NO scales, NO money.
  status: "approved"
  notes: "Agent-reviewed. Mango and vendor apron read; neck birthmark legible; wry look."
  output_path: "images/IMG_01_027.png"

- id: IMG_01_028
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-f6-f20.md — card F8"
  api_call: *api
  reference_images: &serious_f ["images/IMG_01_010.png", "images/IMG_01_008.png", "images/IMG_01_006.png"]
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 32, tall and slim, a lawyer, comfortable — direct and sharp but fair, a level,
    composed, intelligent gaze.

    Key details:
      - chest-up, three-quarter turn, chin level
      - a small mole just above the left side of the upper lip
      - a tailored blazer in muted grey (#6b7280) over a shirt in warm paper cream (#fff8e8), a slim plain document folder held low against the chest, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO papers with writing, NO gavel, NO scales of justice.
  status: "approved"
  notes: "Re-rendered with the female trio: the first pass, on the mixed serious trio, read as a man. Blazer and folder read; lip mole legible."
  output_path: "images/IMG_01_028.png"

- id: IMG_01_029
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-f6-f20.md — card F9"
  api_call: *api
  reference_images: *warm
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 27, slight and slender, who teaches contemporary dance on a low income but does
    what she loves — gentle and graceful, a light, soft expression; a dancer's posture, long neck,
    shoulders down.

    Key details:
      - chest-up, three-quarter turn
      - hair in a high, neat bun
      - a soft wrap cardigan in rose (#d6336c) over a plain fitted top, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO dance pose, NO leotard, NO mirror.
  status: "approved"
  notes: "Agent-reviewed. Wrap cardigan and high bun read; gentle."
  output_path: "images/IMG_01_029.png"

- id: IMG_01_030
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-f6-f20.md — card F10"
  api_call: *api
  reference_images: *serious
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 38, well-proportioned, a tailor who sews to order at home and gets by — neat and
    exacting but well-meaning, an appraising, faintly critical look.

    Key details:
      - chest-up, three-quarter turn
      - long hair in a single braid lying over one shoulder
      - a tape measure draped around the neck as the occupation cue, over a neat blouse in sky (#7fd8e8)
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO scissors, NO needles, NO sewing machine.
  status: "approved"
  notes: "Agent-reviewed. Tape measure and braid read; appraising look."
  output_path: "images/IMG_01_030.png"

- id: IMG_01_031
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-f6-f20.md — card F11"
  api_call: *api
  reference_images: *serious
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 50, heavy-set, a primary school principal on secure footing — strict but loved, a
    firm, authoritative expression with warm eyes; the face clearly reads fifty.

    Key details:
      - chest-up, three-quarter turn, upright
      - short grey hair in a bob
      - a neat blouse in warm paper cream (#fff8e8) under a cardigan in muted grey (#6b7280), reading glasses pushed up into her hair and a red pen clipped to the collar, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO children, NO classroom, NO books, NO badges.
  status: "approved"
  notes: "Agent-reviewed. Grey bob, glasses in the hair and red pen read; the face reads fifty."
  output_path: "images/IMG_01_031.png"

- id: IMG_01_032
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-f6-f20.md — card F12"
  api_call: *api
  reference_images: *warm
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 29, muscular and athletic, a physiotherapist on a steady salary — cheerful and
    encouraging, a big supportive smile.

    Key details:
      - chest-up, three-quarter turn, energetic posture
      - very short, cropped athletic hair
      - a plain polo shirt in coral (#f89880), a resistance band draped over one shoulder, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO gym equipment, NO massage table.
  status: "approved"
  notes: "Agent-reviewed. Polo and resistance band read; cropped hair; cheerful."
  output_path: "images/IMG_01_032.png"

- id: IMG_01_033
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-f6-f20.md — card F13"
  api_call: *api
  reference_images: *serious
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 35, well-proportioned, who owns a flower shop and is comfortable around festival
    season — delicate and calm, an unhurried, serene look.

    Key details:
      - chest-up, three-quarter turn
      - three small piercings along the rim of one ear
      - a work apron in muted grey (#6b7280) over a blouse in warm paper cream (#fff8e8), a small bouquet of rose and gold flowers held low at chest level, well below the face, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO vases, NO shop, NO green leaves or stems, NO flowers near the face.
  status: "approved"
  notes: "Agent-reviewed. Bouquet and apron read; calm. DEFECT: the ear piercings are not legible, and the bouquet's foliage is despilled to olive-grey."
  output_path: "images/IMG_01_033.png"

- id: IMG_01_034
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-f6-f20.md — card F14"
  api_call: *api
  reference_images: *serious_f
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 42, tall and lean, a software engineer, comfortable — quiet and quick-thinking with
    a deadpan humour: a dry, straight-faced look, one corner of the mouth barely raised; the face reads
    early forties.

    Key details:
      - chest-up, three-quarter turn
      - a perfectly straight, blunt-cut fringe
      - a plain hoodie in sky (#7fd8e8), over-ear headphones resting around the neck, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO laptop, NO screens, NO code.
  status: "approved"
  notes: "Re-rendered with the female trio: the first pass read as a man. Hoodie, headphones and blunt fringe read."
  output_path: "images/IMG_01_034.png"

- id: IMG_01_035
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-f6-f20.md — card F15"
  api_call: {<<: *api, seed: 20260924, negative_prompt: "wings pin, wings badge, brooch, lapel pin, insignia, green clothing, green on the person, shadow, gradient background, textured background, checkerboard, text, letters, logo, watermark, anime, manga, photorealistic, 3D render, glossy highlights, more than one person"}
  reference_images: *warm
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 25, petite, a flight attendant on a steady salary plus travel allowance — smiles
    easily but is decisive when it counts, a bright, professional smile.

    Key details:
      - chest-up, three-quarter turn, poised posture
      - a dimple in each cheek
      - a tailored uniform jacket in rose (#d6336c) with a neatly tied neck scarf in warm gold (#ffd27f), as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO wings badge, NO name tag, NO aircraft, NO trolley, NO drinks.
  status: "approved"
  notes: "Re-rendered twice (seed 20260924, then a negative prompt naming the pin). DEFECT on all three renders: a small gold wings pin on the jacket despite 'NO wings badge'; it carries no text or logo. Scarf and jacket read; dimples faint."
  output_path: "images/IMG_01_035.png"

- id: IMG_01_036
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-f6-f20.md — card F16"
  api_call: *api
  reference_images: *serious
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 47, well-proportioned, a ceramic potter who sells her work in spurts and gets by —
    still, composed and measured; the face reads late forties.

    Key details:
      - chest-up, three-quarter turn, one hand raised calmly near the chest
      - a vertical frown line between the brows from concentrating
      - a clay-stained canvas apron in warm paper cream (#fff8e8), a little dried grey clay on the raised hand and forearm, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO pottery wheel, NO cups, NO bowls, NO vases.
  status: "approved"
  notes: "Agent-reviewed. Clay-stained apron and hand read; frown line legible; composed."
  output_path: "images/IMG_01_036.png"

- id: IMG_01_037
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-f6-f20.md — card F17"
  api_call: *api
  reference_images: *serious
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 31, well-proportioned, a forest ranger on a small but steady salary — brave, tough
    and uncomplaining, a determined outdoors look.

    Key details:
      - chest-up, three-quarter turn, squared shoulders
      - a small scar on the tip of the nose
      - a plain field shirt in muted grey (#6b7280) with flap pockets, a pair of binoculars on a strap around the neck held low, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO green uniform, NO badges, NO patches, NO insignia, NO flags, NO weapons, NO trees.
  status: "approved"
  notes: "Agent-reviewed. Binoculars and grey field shirt read. DEFECT: the nose-tip scar is not legible."
  output_path: "images/IMG_01_037.png"

- id: IMG_01_038
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-f6-f20.md — card F18"
  api_call: *api
  reference_images: *warm
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 39, thin, a public librarian on secure but modest footing — quiet, with the small
    private smile of someone amused by her own thoughts.

    Key details:
      - chest-up, three-quarter turn
      - tight, springy, voluminous curly hair
      - a soft cardigan in coral (#f89880) over a plain blouse, a small stack of books with blank spines held low against the chest, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO writing on the books, NO shelves, NO glasses.
  status: "approved"
  notes: "Agent-reviewed. Books with blank spines and curly hair read; private smile."
  output_path: "images/IMG_01_038.png"

- id: IMG_01_039
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-f6-f20.md — card F19"
  api_call: *api
  reference_images: *warm
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 53, heavy-set, who owns a noodle shop she has run for thirty years, comfortable —
    generous-hearted, smiling with her whole eyes; the face reads early fifties.

    Key details:
      - chest-up, three-quarter turn, one hand holding a ladle low at chest level
      - grey-streaked hair tied back in a low knot at the nape
      - a cook's apron in rose (#d6336c) over a plain blouse, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO bowls, NO noodles, NO steam, NO pots, NO food, NO chopsticks.
  status: "approved"
  notes: "Agent-reviewed. Ladle and apron read; grey-streaked hair; the face reads fifties."
  output_path: "images/IMG_01_039.png"

- id: IMG_01_040
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards-f6-f20.md — card F20"
  api_call: *api
  reference_images: *serious_f
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 34, tall and lean, a car mechanic with her own garage, getting by — hot-tempered
    but quick to apologise, an intense, slightly impatient look softened by the eyes.

    Key details:
      - chest-up, three-quarter turn, sleeves rolled up
      - a thin scar across the right cheekbone
      - mechanic's coveralls in muted grey (#6b7280), a work rag tucked in the chest pocket and a small grease smudge on one forearm, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO cars, NO engines, NO tools, NO grease on the face.
  status: "approved"
  notes: "Re-rendered with the female trio: the first pass read as a man. Coveralls, rag and forearm grease read; cheekbone scar legible."
  output_path: "images/IMG_01_040.png"

# --- the first ten, re-rendered into this pipeline (owner ruling 2026-09-23) -----------------
- id: IMG_01_041
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card M1"
  supersedes: "IMG_01_001"
  api_call: *api
  reference_images: &warm_m ["images/IMG_01_012.png", "images/IMG_01_019.png", "images/IMG_01_023.png"]
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 29, tall and slim, a music teacher of modest steady means — quiet, but smiling
    easily and openly, the look of someone humming while thinking.

    Key details:
      - chest-up, three-quarter turn, relaxed shoulders
      - longish dark hair tucked behind the ears
      - a small scar through the outer end of the left eyebrow, subtle but readable
      - a plain soft-collar shirt in sky (#7fd8e8), a plain canvas instrument strap over one shoulder as the occupation cue, the instrument itself out of frame below the crop
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO instrument body in frame, NO printed music, NO notation.
  status: "approved"
  notes: "Agent-reviewed. Instrument strap and sky shirt read; smiling. Minor: the hair reads short and wavy rather than tucked behind the ears, and the eyebrow scar is faint."
  output_path: "images/IMG_01_041.png"

- id: IMG_01_042
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card M2"
  supersedes: "IMG_01_002"
  api_call: *api
  reference_images: &serious_m2 ["images/IMG_01_015.png", "images/IMG_01_017.png", "images/IMG_01_020.png"]
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 34, solidly built and broad, not lean, a dentist who owns his clinic and is
    comfortable — so tidy he reads as faintly tense, posture a little too straight.

    Key details:
      - chest-up, three-quarter turn, squared shoulders, a closed polite smile
      - short, neatly side-parted hair
      - a single mole below the right eye
      - a clean clinical tunic with a soft stand collar in warm paper cream (#fff8e8), as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO dental tools, NO mask, NO gloves.
  status: "approved"
  notes: "Re-rendered on &serious_m2: the first pass copied M6's cook's jacket and striped towel from reference IMG_01_011. Mole legible. DEFECT: the clinical tunic reads as a plain shirt, so the occupation is wardrobe-only, as gh#102's render of this card was."
  output_path: "images/IMG_01_042.png"

- id: IMG_01_043
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card M3"
  supersedes: "IMG_01_003"
  api_call: *api
  reference_images: *serious_m2
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 27, short and muscular, a bicycle repairman with his own small shop, getting by —
    direct and blunt, meeting the viewer's eye without softening it.

    Key details:
      - chest-up, three-quarter turn, right hand raised open near the chest, palm toward the viewer
      - a close-cropped buzz cut
      - a worn callus visible across the right palm
      - sleeves rolled, a sturdy work apron over a plain tee in muted grey (#6b7280), as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO bicycle, NO tools, NO grease on the face.
  status: "approved"
  notes: "Re-rendered on &serious_m2: the first pass raised a fist and hid the palm. Open palm with the callus legible; apron reads; buzz-cut sides."
  output_path: "images/IMG_01_043.png"

- id: IMG_01_044
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card M4"
  supersedes: "IMG_01_004"
  api_call: *api
  reference_images: &serious_m ["images/IMG_01_011.png", "images/IMG_01_015.png", "images/IMG_01_017.png"]
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 38, tall and lean, a corporate accountant on secure footing — visibly calmer and
    more unhurried than people his age, an even, settled expression; the face reads late thirties.

    Key details:
      - chest-up, three-quarter turn, still and upright posture
      - short dark hair with a single patch of grey above the forehead, clearly distinct from the rest
      - a plain buttoned shirt in muted grey (#6b7280), collar neat
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO notebook, NO pen, NO glasses.
  status: "approved"
  notes: "Agent-reviewed. Grey patch legible; reads late thirties; calm. Occupation wardrobe-only, as gh#102's render of this card was."
  output_path: "images/IMG_01_044.png"

- id: IMG_01_045
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card M5"
  supersedes: "IMG_01_005"
  api_call: *api
  reference_images: *serious_m
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a man of 31, thin, who sells plants at a weekend market and does modestly — unhurried and
    slow-moving, with the steady look of someone who forgets nothing.

    Key details:
      - chest-up, three-quarter turn, one forearm raised across the chest, wrist visible
      - shaggy, overgrown hair falling over the ears
      - a small fine-line leaf tattoo on the inner wrist
      - one small potted succulent with dusty blue-grey leaves and a pink bloom, cradled low at chest level as the occupation cue; a loose open shirt in warm gold (#ffd27f) over a plain tee
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO green leaves, NO market stall, NO shelving, NO plant larger than one hand.
  status: "approved"
  notes: "Agent-reviewed. Blue-grey succulent with a pink bloom reads as the cue and survived the key; wrist tattoo legible. DEFECT: the raised hand is a fist, and the hair is spiky rather than shaggy."
  output_path: "images/IMG_01_045.png"

- id: IMG_01_046
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card F1"
  supersedes: "IMG_01_006"
  api_call: *api
  reference_images: &warm_f2 ["images/IMG_01_029.png", "images/IMG_01_032.png", "images/IMG_01_038.png"]
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 30, slight and slender, a night-shift nurse who gets by on overtime — kind in a
    quiet way that does not need words, a little tired around the eyes.

    Key details:
      - chest-up, three-quarter turn, softened shoulders
      - straight hair pulled back into a low ponytail
      - a small mole at the centre of the chin
      - a plain scrub top in sky (#7fd8e8) with a soft V neckline, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO stethoscope, NO medical equipment, NO ID badge.
  status: "approved"
  notes: "Re-rendered on &warm_f2: the first pass copied F6's freckles from reference IMG_01_026. Low ponytail, chin mole and scrubs read; gentle."
  output_path: "images/IMG_01_046.png"

- id: IMG_01_047
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card F2"
  supersedes: "IMG_01_007"
  api_call: *api
  reference_images: *warm_f2
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 33, well-proportioned, who owns a small coffee shop and is comfortable enough —
    mid-conversation, warm and animated, the face of someone who remembers every name.

    Key details:
      - chest-up, three-quarter turn, left hand raised lightly near the shoulder, back of the hand toward the viewer
      - a short pixie cut
      - a faint pale scar across the back of the left hand
      - a work apron in coral (#f89880) over a plain shirt, as the occupation cue
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO cups, NO mugs, NO drinking vessels of any kind, NO coffee equipment.
  status: "approved"
  notes: "Re-rendered on &warm_f2: the first pass copied F6's freckles and raised a fist. Pixie cut and coral apron read; the hand is open. The back-of-hand scar is not legible."
  output_path: "images/IMG_01_047.png"

- id: IMG_01_048
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card F3"
  supersedes: "IMG_01_008"
  api_call: *api
  reference_images: &serious_fn ["images/IMG_01_028.png", "images/IMG_01_030.png", "images/IMG_01_036.png"]
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 36, tall and slim, an architect on secure footing — sharp and ready to argue, but
    with no edge of grudge in it; an amused, engaged expression.

    Key details:
      - chest-up, three-quarter turn, chin slightly raised, one eyebrow a touch higher
      - sleek, straight shoulder-length hair
      - eyes of two clearly different colours, one warm brown and one pale grey-blue
      - a simple structured shirt in warm paper cream (#fff8e8), sleeves crisp
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO drawings, NO rulers, NO architectural models.
  status: "approved"
  notes: "Agent-reviewed. Sleek shoulder-length hair; the two eye colours are legible; structured shirt; sceptical, engaged look."
  output_path: "images/IMG_01_048.png"

- id: IMG_01_049
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card F4"
  supersedes: "IMG_01_009"
  api_call: *api
  reference_images: *warm_f2
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 26, petite, a kindergarten teacher on a low income who is plainly untroubled by
    it — loud, mid-laugh, the most openly cheerful face in the set.

    Key details:
      - chest-up, three-quarter turn, head tilted back a little in a real laugh
      - a bouncy high ponytail
      - one upper front tooth slightly overlapping its neighbour, visible in the open smile
      - a simple blouse with a rounded collar in warm gold (#ffd27f), not a wrap and not a cardigan
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO children, NO classroom, NO toys.
  status: "approved"
  notes: "Re-rendered twice: the first pass copied F6's freckles; the second, on &warm_f2, copied F9's rose wrap cardigan and bun from IMG_01_029, so the blouse moved to warm gold. Laughing; the overlapping tooth is legible. Minor: a curly updo rather than a high ponytail."
  output_path: "images/IMG_01_049.png"

- id: IMG_01_050
  deliverable: "01"
  profile: "asset"
  location: "docs/copy/nuea-khu/cards.md — card F5"
  supersedes: "IMG_01_010"
  api_call: *api
  reference_images: *serious_fn
  ref_flatten: *flat
  brand_block: false
  key_prep: *key
  style_preamble: *pre
  shared_constraints: *post
  prompt: |
    Subject: a woman of 41, full-figured, a freelance translator whose income is irregular but liveable —
    quiet and self-contained, on the edge of saying something at length; the face reads early forties.

    Key details:
      - chest-up, three-quarter turn, composed and still
      - shoulder-length hair with a full fringe, one lock of the fringe clearly refusing to sit with the rest
      - a soft draped top in muted grey (#6b7280)
      - warm ink (#1a1a1a) linework, flat shading

    Constraints: NO books, NO paper, NO screens.
  status: "approved"
  notes: "Agent-reviewed. Full fringe, draped grey top, full figure; reads forties; composed. The unruly lock is not distinct."
  output_path: "images/IMG_01_050.png"
```

---

# Game-card art pilot — croc-bite, three styles (gh#241)

The owner asked (gh#241) for an illustration on every game card in the party grid, generated with the
`gpt-image-2` skill; for these cards only, that overrides `docs/agents/assets.md` rule 1, and every
other rule there still binds. This section is the style pilot: croc-bite rendered in three directions,
and the owner picks one (gh#241's comments). **Owner pick 2026-10-01: direction C, `IMG_02_003`** (gh#241
comment), shipped as `public/art/croc-bite.webp` and wired onto the croc-bite card. Only the picked file enters
`public/art/`; the other two stay here as provenance and never enter `public/`. **In this section
`status: "approved"` means the owner's pick**, not the agent-reviewed meaning the Status section above
gives it for the เนื้อคู่ set; the unpicked two stay `pending` only because the registry has no third value.

**Do not render these through `emit_prompt.py`.** The front matter's `brand_block` is portrait-specific
("chest-up portrait, three-quarter turn", occupation, manner) and `emit_prompt.py` appends it to every
prompt it emits, with no per-entry opt-out; `--all-pending` selects every entry whose status is not
`approved`, so these three would be re-rendered with the portrait block glued on. Each was rendered with
bare `codex exec`, the skill's rule for an entry the block contradicts, from a scratch directory so
Codex could not write into the repo:

    cd <scratch dir> && codex exec --skip-git-repo-check -- "<prompt> Save the final PNG to: <scratch dir>/<name>.png" < /dev/null

**What the model received is not the `prompt:` text.** Codex rewrote each prompt before calling its
built-in `image_gen` tool, then chose on its own to make more calls: three for A (the picked one a fresh
generation from Codex's own third prompt), two for B and two for C (each picked one an edit of the
first). Every call, its as-sent prompt and its output hash is in
`docs/verification/evidence/gh241/as-sent-prompts.json`, extracted from the Codex session logs. Codex
passed `transparent_background: true` on every call: on codex-cli 0.159.2 the tool has that argument.

**Reusing a direction for the other games.** Each prompt is six labelled paragraphs. `Scene:`,
`Style/medium:`, `Composition/framing:`, `Color palette:` and `Constraints:` are the direction;
`Subject:` carries the game's own colours (`Subject colours:`) and its own "nothing else in frame"
exclusions. **The five direction paragraphs are not yet game-neutral**: crocodile wording leaked into
them (A's `Style/medium:` "no scale pattern"; B's `Color palette:` "pure white for teeth"; C's
`Style/medium:` "highlights on the teeth and eyes", "NO realistic reptile skin, NO scale texture"). Before
the picked direction is reused (gh#242), move that wording into `Subject:`; then a new game's entry copies
the five paragraphs and writes a new `Subject:`. The `prompt:` text below stays as sent. Attach the picked master with `-i` as
the style reference (the skill's Style anchoring): Codex rewrites the prompt, so the text alone does not
pin the look.

**Direction C reuse template — the picked direction, made game-neutral (gh#242 starts here).** The
`IMG_02_003` paragraphs below with the crocodile wording moved out: C's `Style/medium:` "specular
highlights on the teeth and eyes" became "on the subject's glossy parts", and "NO realistic reptile skin,
NO scale texture" became "NO realistic surface texture". Croc-bite's own copy of those two phrases now
belongs in its `Subject:`. A new game's entry is this block plus its own `Subject:` (shape, pose, `Subject
colours:`, "Nothing else in frame: …"), rendered with `-i images/IMG_02_003.png` as the style reference.

    Scene: a game-card illustration for the game grid of a Thai party-game website — one isolated subject that names the game at a glance, isolated on a fully transparent background.

    Style/medium: SOFT 3D TOY RENDER — a rounded vinyl or clay toy with smooth satin, lightly clear-coated surfaces, soft volumetric shading, gentle ambient occlusion in the creases, a soft studio key light from the upper left with a soft fill, small soft specular highlights on the subject's glossy parts, like a premium designer toy or a modern 3D mobile-game mascot. NOT photorealistic, NO realistic surface texture, NO ink outline, NOT flat vector, NOT a sticker.

    Composition/framing: one subject, centred with even margin on all four sides, square 1:1 aspect, the whole subject inside the frame with nothing cropped, readable as a small thumbnail.

    Color palette: the subject's own material colours named in Subject, saturated but softly lit; no colour grade over the whole image and no coloured rim light from an environment; coral (#f89880) never as a large area, because the card the art sits on is coral.

    Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO hands, NO faces of people, NO logos, NO brand marks, NO watermarks, NO text, NO letters, NO numbers. NO cast shadow or contact shadow beneath the subject, NO floor, NO reflection.

**Masters vs ship derivatives.** `output_path` is the raw model output, byte-identical to the file in
`~/.codex/generated_images/` that the run saved (`sha256_master` below, matched by hash per
`docs/agents/assets.md` rule 5). It is NOT the shippable cutout: every raw render carried alpha-1-to-3
haze outside the subject. `ship_derivative` is made from the master by
`docs/verification/evidence/gh241/make_ship.py`: an alpha level remap with the black point at the
highest haze alpha (never `-threshold`), `magick -trim +repage`, a fit inside 502x320 (the proposed
251x160 CSS px card slot at 2x), and `cwebp -q 88 -alpha_q 100`. The picked webp entered `public/art/`
byte-identical (`IMG_02_003.webp` as `public/art/croc-bite.webp`, sha256 `96940eba…b55fe1`).

Transparency, graded by `docs/verification/evidence/gh241/grade.py`. Its positive control reproduces the
gh#102 ten (fully transparent 36.7%-46.5%, `IMG_01_002`'s bottom corners 66 and 76, haze outside 0 on
all ten); its must-reds go red (an opaque flatten reads `srgb` and 0%; one planted alpha-10 pixel reads
haze outside 1). "Haze outside" counts alpha 1-25 pixels outside the alpha >= 26 mask dilated by a
radius-4 disk.

| id | direction | channels | transparent, raw | haze outside, raw | black point | haze outside, trimmed and shipped | corners after trim | ship bytes |
|---|---|---|---|---|---|---|---|---|
| `IMG_02_001` | A flat editorial | srgba | 56.01% | 1583 | 2 | 0 / 0 | 0 0 0 0 | 34,962 |
| `IMG_02_002` | B bold sticker pop | srgba | 51.89% | 407 | 2 | 0 / 0 | 0 0 0 0 | 31,438 |
| `IMG_02_003` | C soft 3D toy | srgba | 51.35% | 2761 | 3 | 0 / 0 | 0 0 0 0 | 29,038 |

The owner's comparison sheet, the proposed card slot and the full grading record:
`docs/verification/evidence/gh241/README.md`.

```yaml
- id: IMG_02_001
  deliverable: "02"
  profile: "asset"
  api_call:
    model: "ChatGPT Images 2.5 via the Codex built-in image_gen tool (inferred: the tool reports no model id; codex-cli 0.159.2, transparent_background: true)"
    size: "auto"
  location: "party grid game card (src/pages/c/[category].astro, .game-card), croc-bite - not picked, never wired"
  direction: "A - flat editorial"
  purpose: "croc-bite card art, direction A: the shipped site style - even ink outline, flat colour areas, at most two flat shade tones, restrained, brand palette plus a muted croc green (#4caf6e)."
  prompt: |
    Scene: a game-card illustration for the game grid of a Thai party-game website — one isolated subject that names the game at a glance, isolated on a fully transparent background.

    Subject: a cartoon toy crocodile seen from a front three-quarter view, sitting low and compact, its jaws wide open to show a neat row of big rounded white teeth along the lower jaw and a matching row along the upper jaw, the mouth and a small tongue visible inside, a friendly, slightly mischievous expression. Subject colours: body croc green (#4caf6e) with one flat shade tone (#3a8a56), pale green belly and underside of the jaw (#cfe8c2), mouth interior and gums rose (#d6336c), teeth warm paper cream (#fff8e8), eyes warm gold (#ffd27f) with ink pupils. Nothing else in frame: no water, no lily pads, no splash, no ground, no props.

    Style/medium: FLAT EDITORIAL VECTOR ILLUSTRATION — large simple areas of flat colour, a single clean ink outline of even, medium weight, at most two flat shade tones per area, no gradients, no airbrushing, no glossy highlights, no texture, no scale pattern. Restrained and calm, like a modern printed magazine spot illustration. NOT 3D, NOT photorealistic, NOT anime, NOT a sticker.

    Composition/framing: one subject, centred with even margin on all four sides, square 1:1 aspect, the whole subject inside the frame with nothing cropped, readable as a small thumbnail.

    Color palette: warm ink (#1a1a1a) linework; warm paper cream (#fff8e8) for light areas; rose (#d6336c), warm gold (#ffd27f) and sky (#7fd8e8) used sparingly as accents; coral (#f89880) only as a small accent, never a large area, because the card the art sits on is coral; the subject's own main colours are the ones named in Subject, kept muted so they sit with this palette.

    Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO hands, NO faces of people, NO logos, NO brand marks, NO watermarks, NO text, NO letters, NO numbers. NO cast shadow or contact shadow beneath the subject, NO floor.
  status: "pending"
  output_path: "images/IMG_02_001.png"
  sha256_master: "6c1183eab99d87e87807e009ef3ad9fe3eb015f9691be34b682fafefafdb6272"
  ship_derivative: "images/gh241-ship/IMG_02_001.webp"
  notes: "Bare codex exec, NOT emit_prompt.py: the front-matter brand_block is portrait-specific. Not picked - provenance only (owner pick 2026-10-01 was IMG_02_003); never enters public/. Codex made 3 image_gen calls; the picked one (3rd) is a fresh generation from a prompt Codex wrote itself after judging the first too soft-shaded - see as-sent-prompts.json. Raw: srgba, 56.01% fully transparent, 1583 haze px outside the dilated solid mask (alpha 1 x1582, alpha 2 x1). Level remap black point 2 -> haze 0; trimmed 1110x872, 29.06% transparent, corners 0/0/0/0. Ship webp 407x320, 34962 bytes, decoded: haze 0, corners 0/0/0/0, 28.65% transparent. Look check (flattened on #f89880 and #1a1a1a, edges enlarged 4x): no fringe or halo, no painted checkerboard, no text, no bottle/can/glass, no human or hand. The cream toe claws echo the teeth."

- id: IMG_02_002
  deliverable: "02"
  profile: "asset"
  api_call:
    model: "ChatGPT Images 2.5 via the Codex built-in image_gen tool (inferred: the tool reports no model id; codex-cli 0.159.2, transparent_background: true)"
    size: "auto"
  location: "party grid game card (src/pages/c/[category].astro, .game-card), croc-bite - not picked, never wired"
  direction: "B - bold sticker pop"
  purpose: "croc-bite card art, direction B: loud cartoon mascot - thick chunky ink outline, saturated flat fills, exaggerated proportions, big expression; still flat, no shadow."
  prompt: |
    Scene: a game-card illustration for the game grid of a Thai party-game website — one isolated subject that names the game at a glance, isolated on a fully transparent background.

    Subject: a cartoon toy crocodile mascot seen from a front three-quarter view, chunky and compact with an oversized head and tiny stubby legs, its jaws flung wide open to show a neat row of big square white teeth along the lower jaw and a matching row along the upper jaw, a red mouth and a little tongue inside, huge round eyes and a big gleeful, cheeky grin. Subject colours: body bright green (#27ae60), belly and snout ridge light green (#7bed9f), mouth interior red (#d63031), tongue (#ff4757), teeth pure white (#ffffff), eyes white with big ink pupils and a flat white catch-light, warm gold (#ffd27f) eyelids. Nothing else in frame: no water, no lily pads, no splash, no ground, no props.

    Style/medium: BOLD CARTOON STICKER-POP MASCOT — a thick, chunky ink outline of heavy even weight around the silhouette and every shape, saturated flat colour fills, exaggerated playful proportions, a big readable expression, loud and energetic like a game mascot. Flat fills only, at most one flat shade tone per area, no gradients, no airbrushing, no glossy highlights beyond flat white catch-lights in the eyes, no texture. The thick ink outline is the outermost edge of the silhouette — no white sticker border. NOT 3D, NOT photorealistic, NOT anime.

    Composition/framing: one subject, centred with even margin on all four sides, square 1:1 aspect, the whole subject inside the frame with nothing cropped, readable as a small thumbnail.

    Color palette: warm ink (#1a1a1a) for the thick outline and pupils; pure white (#ffffff) for teeth and catch-lights; the subject's own colours named in Subject at full saturation; rose (#d6336c) and warm gold (#ffd27f) as pop accents; no pastel and no muted tones; coral (#f89880) never as a large area, because the card the art sits on is coral.

    Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO hands, NO faces of people, NO logos, NO brand marks, NO watermarks, NO text, NO letters, NO numbers. NO cast shadow or contact shadow beneath the subject, NO floor.
  status: "pending"
  output_path: "images/IMG_02_002.png"
  sha256_master: "77f6b57badef16afa973915c9da3b64e2ddf38919cec6158f1ef13de60482e09"
  ship_derivative: "images/gh241-ship/IMG_02_002.webp"
  notes: "Bare codex exec, NOT emit_prompt.py: the front-matter brand_block is portrait-specific. Not picked - provenance only (owner pick 2026-10-01 was IMG_02_003); never enters public/. Codex made 2 image_gen calls; the picked one (2nd) is an edit of the first, which Codex judged to carry gradients - see as-sent-prompts.json. Raw: srgba, 51.89% fully transparent, 407 haze px outside the dilated solid mask (alpha 1 x405, alpha 2 x2). Level remap black point 2 -> haze 0; trimmed 1117x1027, 34.46% transparent, corners 0/0/0/0. Ship webp 348x320, 31438 bytes, decoded: haze 0, corners 0/0/0/0, 33.86% transparent. Look check (flattened on #f89880 and #1a1a1a, edges enlarged 4x): no fringe or halo, no painted checkerboard, no text, no bottle/can/glass, no human or hand. Square teeth, upright pose with tail."

- id: IMG_02_003
  deliverable: "02"
  profile: "asset"
  api_call:
    model: "ChatGPT Images 2.5 via the Codex built-in image_gen tool (inferred: the tool reports no model id; codex-cli 0.159.2, transparent_background: true)"
    size: "auto"
  location: "party grid game card (src/pages/c/[category].astro, .game-card), croc-bite - wired 2026-10-01 as /art/croc-bite.webp via the croc-bite module cardArt field"
  direction: "C - soft 3D toy"
  purpose: "croc-bite card art, direction C: rounded vinyl toy render with soft volumetric shading, in the live croc-bite route material colours (#27ae60 skin); not photoreal."
  prompt: |
    Scene: a game-card illustration for the game grid of a Thai party-game website — one isolated subject that names the game at a glance, isolated on a fully transparent background.

    Subject: a cute toy crocodile seen from a front three-quarter view, rounded and chubby like a designer vinyl toy, its jaws wide open to show a neat row of big rounded glossy white teeth along the lower jaw and a matching row along the upper jaw, a deep red mouth with a red gum band and a small tongue inside, big glossy eyes, a friendly, playful expression. Subject colours: body saturated playful green (#27ae60), lighter snout ridge and belly (#2ecc71), deep mouth throat (#8b2626), gum band (#d63031), tongue (#c0392b), glossy white teeth (#ffffff), yellowish sclera (#fef9e7), glossy dark pupils (#111111), dark green nostrils (#145a32). Nothing else in frame: no water, no lily pads, no splash, no ground, no props.

    Style/medium: SOFT 3D TOY RENDER — a rounded vinyl or clay toy with smooth satin, lightly clear-coated surfaces, soft volumetric shading, gentle ambient occlusion in the creases, a soft studio key light from the upper left with a soft fill, small soft specular highlights on the teeth and eyes, like a premium designer toy or a modern 3D mobile-game mascot. NOT photorealistic, NO realistic reptile skin, NO scale texture, NO ink outline, NOT flat vector, NOT a sticker.

    Composition/framing: one subject, centred with even margin on all four sides, square 1:1 aspect, the whole subject inside the frame with nothing cropped, readable as a small thumbnail.

    Color palette: the subject's own material colours named in Subject, saturated but softly lit; no colour grade over the whole image and no coloured rim light from an environment; coral (#f89880) never as a large area, because the card the art sits on is coral.

    Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO hands, NO faces of people, NO logos, NO brand marks, NO watermarks, NO text, NO letters, NO numbers. NO cast shadow or contact shadow beneath the subject, NO floor, NO reflection.
  status: "approved"
  output_path: "images/IMG_02_003.png"
  sha256_master: "05d722e01853839107cad0c4de161eda9c3ff68f73292d8be8c2eee76c646ed9"
  ship_derivative: "images/gh241-ship/IMG_02_003.webp"
  notes: "Bare codex exec, NOT emit_prompt.py: the front-matter brand_block is portrait-specific. Approved = owner pick 2026-10-01 (gh#241 comment), shipped as public/art/croc-bite.webp (the ship_derivative byte-identical). Codex made 2 image_gen calls; the picked one (2nd) is an edit of the first that Codex asked for as an alpha clean-up - see as-sent-prompts.json. Raw: srgba, 51.35% fully transparent, 2761 haze px outside the dilated solid mask (alpha 1 x2632, 2 x120, 3 x9; median 5.4 px outside the silhouette - a faint ring). Level remap black point 3 -> haze 0; trimmed 1118x991, 31.91% transparent, corners 0/0/0/0. Ship webp 361x320, 29038 bytes, decoded: haze 0, corners 0/0/0/0, 31.29% transparent. Look check (flattened on #f89880 and #1a1a1a, edges enlarged 4x): no fringe or halo, no contact shadow or floor under the feet, no painted checkerboard, no text, no bottle/can/glass, no human or hand."
```


# Game-card art — the remaining thirteen party games, direction C (gh#242)

The owner's direction C pick (gh#241, `IMG_02_003`), rendered for every other party-grid game. The scope
is the party grid only (gh#242 comment 2026-10-04): the art slot lives only in the party card's artboard,
and ADR-0040 says the fortune หมวด is not เกม. Each entry's `prompt:` is the **Direction C reuse
template** above, unchanged, with the game's own `Subject:` placed second, exactly as in `IMG_02_003`.
After the first test render, one sentence was added to every `Subject:`: "Every part is solid and opaque,
with crisp edges: no glow, no soft mist, no haze, no motion blur". The reason: the first cursed-number
try asked for a glowing mist, and it read as 29,107 haze pixels outside the solid mask, which no level
remap clears without cutting into the mist. That try was discarded and never entered `images/`.

**How each was rendered.** Each was rendered with bare `codex exec` from a scratch directory, never
`emit_prompt.py` (its `brand_block` is portrait-specific; see the gh#241 section).
- The style reference was attached with `-i images/IMG_02_003.png`, and the prompt was prefixed with:
  "Input images: image 1 (<path>) is a STYLE REFERENCE only - match its rendering style, lighting and
  material finish; do not copy its subject."
- Four renders ran at a time, 90-312 s each.
- Every `image_gen` call passed `transparent_background: true`.
- Codex rewrote each prompt and sometimes made a second or third call, an edit of its own first output.
  Every call, its as-sent prompt and its output hash are in
  `docs/verification/evidence/gh242/as-sent-prompts.json`.
- Each master below is matched to its call by sha256, never by mtime.

**pinocchio-luck needed a second subject.** The first wording was a carved wooden puppet head with a long
nose, a felt cap, painted cheeks and a smile. The image tool's output moderation refused it
(`moderation_blocked`, category "other", no further reason). The likeliest cause is a likeness filter for
the named character; that is inferred, not stated by the tool. The entry below is the second wording: an
abstract egg-shaped wooden toy with a long nose, no mouth and no hat, described as "not any known
character". The game's own name and copy are unchanged.

**Ship derivatives** are made exactly as for the pilot:
- `docs/verification/evidence/gh241/make_ship.py` builds them, with the black point set to the highest
  haze alpha outside the radius-4 dilated solid mask. The same rule reproduces the pilot's black points
  2/2/3.
- `docs/verification/evidence/gh241/grade.py` grades them.
- Positive control, run first: `make_ship.py` on `IMG_02_003` at black point 3 rebuilt
  `public/art/croc-bite.webp` byte-identical (sha256 `96940eba…`).
- Each ship webp entered `public/art/<game-id>.webp` byte-identical.

The batch script and the grading log are in `docs/verification/evidence/gh242/` (`ship_all.py`,
`grade-ship.jsonl`), with the set shown on the coral card ground and on ink (`set-coral-1.png`,
`set-coral-2.png`, `set-ink.png`). The scripts resolve their paths against the session scratch directory
they ran from, so they are a record, not a runnable pipeline.

**Whether the set reads as one style next to the pilot is the owner's call** (gh#242), so every entry
below stays `pending` until the owner says so.

| id | game | black point | haze outside, shipped | corners | ship size | ship bytes | image_gen calls (picked) |
|---|---|---|---|---|---|---|---|
| `IMG_03_001` | timebomb | 2 | 0 | 0 0 0 0 | 283x320 | 13,744 | 2 (2) |
| `IMG_03_002` | short-stick | 3 | 0 | 0 0 0 0 | 324x320 | 23,092 | 1 (1) |
| `IMG_03_003` | freeze-tap | 7 | 0 | 0 0 0 0 | 351x320 | 21,292 | 2 (2) |
| `IMG_03_004` | cannon-flag | 4 | 0 | 0 0 0 0 | 382x320 | 22,274 | 2 (2) |
| `IMG_03_005` | power-meter | 2 | 0 | 0 0 0 0 | 473x320 | 25,292 | 2 (2) |
| `IMG_03_006` | dice-loser | 3 | 0 | 0 0 0 0 | 308x320 | 18,836 | 1 (1) |
| `IMG_03_007` | how-close-is-near | 3 | 0 | 0 0 0 0 | 310x320 | 20,358 | 2 (2) |
| `IMG_03_008` | pinocchio-luck | 2 | 0 | 0 0 0 0 | 448x320 | 15,962 | 2 (2) |
| `IMG_03_009` | cursed-number | 4 | 0 | 0 0 0 0 | 367x320 | 15,884 | 1 (1) |
| `IMG_03_010` | wire-snip-panic | 4 | 0 | 0 0 0 0 | 264x320 | 20,310 | 2 (2) |
| `IMG_03_011` | zero-trigger | 2 | 0 | 0 0 0 0 | 280x320 | 18,440 | 2 (2) |
| `IMG_03_012` | one-bomb | 3 | 0 | 0 0 0 0 | 390x320 | 21,058 | 2 (2) |
| `IMG_03_013` | bangkok-drift | 2 | 0 | 0 0 0 0 | 468x320 | 29,328 | 3 (3) |

`IMG_03_003` (freeze-tap) needed black point 7, higher than the others (2-4): its frost cap and ice
crystals carry a wider faint alpha fringe. Its shipped edges were checked at 4x on ink, with no halo and no
visible loss.

```yaml
- id: IMG_03_001
  deliverable: "03"
  profile: "asset"
  api_call:
    model: "ChatGPT Images 2.5 via the Codex built-in image_gen tool (inferred: the tool reports no model id; codex-cli 0.159.2, transparent_background: true)"
    size: "auto"
  style_ref: "images/IMG_02_003.png"
  location: "party grid game card (src/pages/c/[category].astro, .game-card), timebomb - wired 2026-10-04 as /art/timebomb.webp via the timebomb module cardArt field"
  direction: "C - soft 3D toy"
  purpose: "timebomb card art in direction C (gh#242)."
  prompt: |
    Scene: a game-card illustration for the game grid of a Thai party-game website — one isolated subject that names the game at a glance, isolated on a fully transparent background.

    Subject: a cute round toy cartoon bomb seen from a front three-quarter view, a chubby glossy sphere with a short stubby fuse cap on top and a curling fuse with a small bright spark at its tip, two tiny solid star-shaped sparks beside it. Subject colours: bomb body deep navy slate (#334155) with soft lighter highlights (#5b6b85), fuse cap brass gold (#c9a227), fuse cord warm tan (#d9b98a), spark warm yellow (#fde68a) with an orange core (#f59e0b) and a red-orange edge (#ef4444). The bomb has no face, no eyes and no clock dial. Every part is solid and opaque, with crisp edges: no glow, no soft mist, no haze, no motion blur. Nothing else in frame: no smoke cloud, no explosion, no ground, no props.

    Style/medium: SOFT 3D TOY RENDER — a rounded vinyl or clay toy with smooth satin, lightly clear-coated surfaces, soft volumetric shading, gentle ambient occlusion in the creases, a soft studio key light from the upper left with a soft fill, small soft specular highlights on the subject's glossy parts, like a premium designer toy or a modern 3D mobile-game mascot. NOT photorealistic, NO realistic surface texture, NO ink outline, NOT flat vector, NOT a sticker.

    Composition/framing: one subject, centred with even margin on all four sides, square 1:1 aspect, the whole subject inside the frame with nothing cropped, readable as a small thumbnail.

    Color palette: the subject's own material colours named in Subject, saturated but softly lit; no colour grade over the whole image and no coloured rim light from an environment; coral (#f89880) never as a large area, because the card the art sits on is coral.

    Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO hands, NO faces of people, NO logos, NO brand marks, NO watermarks, NO text, NO letters, NO numbers. NO cast shadow or contact shadow beneath the subject, NO floor, NO reflection.
  status: "pending"
  output_path: "images/IMG_03_001.png"
  sha256_master: "69b850d471281d65d4cbf8c7201151783bdd6b0541ee020389fe1f4bcfcfdf80"
  ship_derivative: "images/gh242-ship/IMG_03_001.webp"
  notes: "Bare codex exec with -i images/IMG_02_003.png. 2 image_gen call(s); the master is call 2, matched by sha256 (as-sent-prompts.json). Raw: 67.86% fully transparent, 3650 haze px outside the dilated solid mask. Level remap black point 2 -> haze 0. Ship webp 283x320, 13744 bytes, decoded: haze 0, corners 0/0/0/0, 45.82% transparent. Look check (flattened on #f89880 and #1a1a1a): no fringe or halo, no text, letters or numerals, no bottle/can/glass, no human or hand."

- id: IMG_03_002
  deliverable: "03"
  profile: "asset"
  api_call:
    model: "ChatGPT Images 2.5 via the Codex built-in image_gen tool (inferred: the tool reports no model id; codex-cli 0.159.2, transparent_background: true)"
    size: "auto"
  style_ref: "images/IMG_02_003.png"
  location: "party grid game card (src/pages/c/[category].astro, .game-card), short-stick - wired 2026-10-04 as /art/short-stick.webp via the short-stick module cardArt field"
  direction: "C - soft 3D toy"
  purpose: "short-stick card art in direction C (gh#242)."
  prompt: |
    Scene: a game-card illustration for the game grid of a Thai party-game website — one isolated subject that names the game at a glance, isolated on a fully transparent background.

    Subject: a small fan of five rounded wooden toy sticks held upright in a chunky round wooden stick holder, the sticks fanned out slightly, their rounded tips coloured, one stick clearly much shorter than the others and poking up only a little. Subject colours: sticks warm honey wood (#d97706) with lighter grain-free highlights (#fbbf24), tips rose (#f43f5e) and pale yellow (#fef08a), holder deep amber wood (#b45309) with a rose band (#e11d48). Every part is solid and opaque, with crisp edges: no glow, no soft mist, no haze, no motion blur. Nothing else in frame: no hands, no table, no ground, no props.

    Style/medium: SOFT 3D TOY RENDER — a rounded vinyl or clay toy with smooth satin, lightly clear-coated surfaces, soft volumetric shading, gentle ambient occlusion in the creases, a soft studio key light from the upper left with a soft fill, small soft specular highlights on the subject's glossy parts, like a premium designer toy or a modern 3D mobile-game mascot. NOT photorealistic, NO realistic surface texture, NO ink outline, NOT flat vector, NOT a sticker.

    Composition/framing: one subject, centred with even margin on all four sides, square 1:1 aspect, the whole subject inside the frame with nothing cropped, readable as a small thumbnail.

    Color palette: the subject's own material colours named in Subject, saturated but softly lit; no colour grade over the whole image and no coloured rim light from an environment; coral (#f89880) never as a large area, because the card the art sits on is coral.

    Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO hands, NO faces of people, NO logos, NO brand marks, NO watermarks, NO text, NO letters, NO numbers. NO cast shadow or contact shadow beneath the subject, NO floor, NO reflection.
  status: "pending"
  output_path: "images/IMG_03_002.png"
  sha256_master: "0ebe1796bd6c66eb78533bb591d6a709df81697e985f35544eb73a2c25c40d62"
  ship_derivative: "images/gh242-ship/IMG_03_002.webp"
  notes: "Bare codex exec with -i images/IMG_02_003.png. 1 image_gen call(s); the master is call 1, matched by sha256 (as-sent-prompts.json). Raw: 55.13% fully transparent, 8234 haze px outside the dilated solid mask. Level remap black point 3 -> haze 0. Ship webp 324x320, 23092 bytes, decoded: haze 0, corners 0/0/0/0, 38.83% transparent. Look check (flattened on #f89880 and #1a1a1a): no fringe or halo, no text, letters or numerals, no bottle/can/glass, no human or hand."

- id: IMG_03_003
  deliverable: "03"
  profile: "asset"
  api_call:
    model: "ChatGPT Images 2.5 via the Codex built-in image_gen tool (inferred: the tool reports no model id; codex-cli 0.159.2, transparent_background: true)"
    size: "auto"
  style_ref: "images/IMG_02_003.png"
  location: "party grid game card (src/pages/c/[category].astro, .game-card), freeze-tap - wired 2026-10-04 as /art/freeze-tap.webp via the freeze-tap module cardArt field"
  direction: "C - soft 3D toy"
  purpose: "freeze-tap card art in direction C (gh#242)."
  prompt: |
    Scene: a game-card illustration for the game grid of a Thai party-game website — one isolated subject that names the game at a glance, isolated on a fully transparent background.

    Subject: a big chunky toy arcade push button seen from a front three-quarter view, a glossy round red dome button on a squat round dark base, with a few small cute ice crystals and a light frost cap clinging to the top of the dome, as if the button is frozen. Subject colours: button dome red (#ef4444) with soft pink highlights (#fca5a5), base dark slate (#1e293b) with a lighter rim (#334155), ice crystals and frost icy sky blue (#38bdf8) and pale ice white (#e0f2fe). Every part is solid and opaque, with crisp edges: no glow, no soft mist, no haze, no motion blur. Nothing else in frame: no fingers, no hands, no ground, no props.

    Style/medium: SOFT 3D TOY RENDER — a rounded vinyl or clay toy with smooth satin, lightly clear-coated surfaces, soft volumetric shading, gentle ambient occlusion in the creases, a soft studio key light from the upper left with a soft fill, small soft specular highlights on the subject's glossy parts, like a premium designer toy or a modern 3D mobile-game mascot. NOT photorealistic, NO realistic surface texture, NO ink outline, NOT flat vector, NOT a sticker.

    Composition/framing: one subject, centred with even margin on all four sides, square 1:1 aspect, the whole subject inside the frame with nothing cropped, readable as a small thumbnail.

    Color palette: the subject's own material colours named in Subject, saturated but softly lit; no colour grade over the whole image and no coloured rim light from an environment; coral (#f89880) never as a large area, because the card the art sits on is coral.

    Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO hands, NO faces of people, NO logos, NO brand marks, NO watermarks, NO text, NO letters, NO numbers. NO cast shadow or contact shadow beneath the subject, NO floor, NO reflection.
  status: "pending"
  output_path: "images/IMG_03_003.png"
  sha256_master: "42123fe9d113aa0240436293d5da76c980f997d0e5b5e19e74fb72d148bafc4b"
  ship_derivative: "images/gh242-ship/IMG_03_003.webp"
  notes: "Bare codex exec with -i images/IMG_02_003.png. 2 image_gen call(s); the master is call 2, matched by sha256 (as-sent-prompts.json). Raw: 46.25% fully transparent, 10100 haze px outside the dilated solid mask. Level remap black point 7 -> haze 0. Ship webp 351x320, 21292 bytes, decoded: haze 0, corners 0/0/0/0, 27.93% transparent. Look check (flattened on #f89880 and #1a1a1a): no fringe or halo, no text, letters or numerals, no bottle/can/glass, no human or hand."

- id: IMG_03_004
  deliverable: "03"
  profile: "asset"
  api_call:
    model: "ChatGPT Images 2.5 via the Codex built-in image_gen tool (inferred: the tool reports no model id; codex-cli 0.159.2, transparent_background: true)"
    size: "auto"
  style_ref: "images/IMG_02_003.png"
  location: "party grid game card (src/pages/c/[category].astro, .game-card), cannon-flag - wired 2026-10-04 as /art/cannon-flag.webp via the cannon-flag module cardArt field"
  direction: "C - soft 3D toy"
  purpose: "cannon-flag card art in direction C (gh#242)."
  prompt: |
    Scene: a game-card illustration for the game grid of a Thai party-game website — one isolated subject that names the game at a glance, isolated on a fully transparent background.

    Subject: a chubby toy cannon on two big round wheels seen from a front three-quarter view, its short rounded barrel tilted up, and beside it a small toy flag on a thin pole stuck in a little round grassy mound, the flag a plain triangular pennant with no symbol on it. Subject colours: cannon barrel deep blue-grey (#475569) with soft highlights (#94a3b8), wheels warm orange (#f97316) with gold hubs (#fbbf24), pennant red (#ef4444), pole light grey (#e2e8f0), mound green (#22c55e). Every part is solid and opaque, with crisp edges: no glow, no soft mist, no haze, no motion blur. Nothing else in frame: no cannonball in flight, no smoke, no ground beyond the small mound, no other props.

    Style/medium: SOFT 3D TOY RENDER — a rounded vinyl or clay toy with smooth satin, lightly clear-coated surfaces, soft volumetric shading, gentle ambient occlusion in the creases, a soft studio key light from the upper left with a soft fill, small soft specular highlights on the subject's glossy parts, like a premium designer toy or a modern 3D mobile-game mascot. NOT photorealistic, NO realistic surface texture, NO ink outline, NOT flat vector, NOT a sticker.

    Composition/framing: one subject, centred with even margin on all four sides, square 1:1 aspect, the whole subject inside the frame with nothing cropped, readable as a small thumbnail.

    Color palette: the subject's own material colours named in Subject, saturated but softly lit; no colour grade over the whole image and no coloured rim light from an environment; coral (#f89880) never as a large area, because the card the art sits on is coral.

    Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO hands, NO faces of people, NO logos, NO brand marks, NO watermarks, NO text, NO letters, NO numbers. NO cast shadow or contact shadow beneath the subject, NO floor, NO reflection.
  status: "pending"
  output_path: "images/IMG_03_004.png"
  sha256_master: "ab6eb4166edb668c76286a4b1909c7f5a92a3a7bd9a736c977ba717f4201dc9f"
  ship_derivative: "images/gh242-ship/IMG_03_004.webp"
  notes: "Bare codex exec with -i images/IMG_02_003.png. 2 image_gen call(s); the master is call 2, matched by sha256 (as-sent-prompts.json). Raw: 57.66% fully transparent, 3415 haze px outside the dilated solid mask. Level remap black point 4 -> haze 0. Ship webp 382x320, 22274 bytes, decoded: haze 0, corners 0/0/0/0, 35.00% transparent. Look check (flattened on #f89880 and #1a1a1a): no fringe or halo, no text, letters or numerals, no bottle/can/glass, no human or hand."

- id: IMG_03_005
  deliverable: "03"
  profile: "asset"
  api_call:
    model: "ChatGPT Images 2.5 via the Codex built-in image_gen tool (inferred: the tool reports no model id; codex-cli 0.159.2, transparent_background: true)"
    size: "auto"
  style_ref: "images/IMG_02_003.png"
  location: "party grid game card (src/pages/c/[category].astro, .game-card), power-meter - wired 2026-10-04 as /art/power-meter.webp via the power-meter module cardArt field"
  direction: "C - soft 3D toy"
  purpose: "power-meter card art in direction C (gh#242)."
  prompt: |
    Scene: a game-card illustration for the game grid of a Thai party-game website — one isolated subject that names the game at a glance, isolated on a fully transparent background.

    Subject: a chunky toy power gauge seen from the front, a rounded semicircular dial housing with a thick glossy arc of coloured segments running from green on the left through yellow to hot pink-red on the right, a single fat needle pointing high into the red end, and a round glossy cap at the needle's pivot. The dial carries no numbers, no tick labels and no markings other than the coloured segments. Subject colours: housing deep violet (#7c3aed) with soft highlights (#a855f7), segments green (#10b981), yellow (#ffd700), amber (#f59e0b), hot pink-red (#ff2a5f), needle and pivot cap cyan (#00f2fe). Every part is solid and opaque, with crisp edges: no glow, no soft mist, no haze, no motion blur. Nothing else in frame: no hands, no ground, no props.

    Style/medium: SOFT 3D TOY RENDER — a rounded vinyl or clay toy with smooth satin, lightly clear-coated surfaces, soft volumetric shading, gentle ambient occlusion in the creases, a soft studio key light from the upper left with a soft fill, small soft specular highlights on the subject's glossy parts, like a premium designer toy or a modern 3D mobile-game mascot. NOT photorealistic, NO realistic surface texture, NO ink outline, NOT flat vector, NOT a sticker.

    Composition/framing: one subject, centred with even margin on all four sides, square 1:1 aspect, the whole subject inside the frame with nothing cropped, readable as a small thumbnail.

    Color palette: the subject's own material colours named in Subject, saturated but softly lit; no colour grade over the whole image and no coloured rim light from an environment; coral (#f89880) never as a large area, because the card the art sits on is coral.

    Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO hands, NO faces of people, NO logos, NO brand marks, NO watermarks, NO text, NO letters, NO numbers. NO cast shadow or contact shadow beneath the subject, NO floor, NO reflection.
  status: "pending"
  output_path: "images/IMG_03_005.png"
  sha256_master: "8af28543c0146eeae10248dfba7b519bb2a339f904bb1fd4cb3337e89affe975"
  ship_derivative: "images/gh242-ship/IMG_03_005.webp"
  notes: "Bare codex exec with -i images/IMG_02_003.png. 2 image_gen call(s); the master is call 2, matched by sha256 (as-sent-prompts.json). Raw: 55.18% fully transparent, 2192 haze px outside the dilated solid mask. Level remap black point 2 -> haze 0. Ship webp 473x320, 25292 bytes, decoded: haze 0, corners 0/0/0/0, 21.04% transparent. Look check (flattened on #f89880 and #1a1a1a): no fringe or halo, no text, letters or numerals, no bottle/can/glass, no human or hand."

- id: IMG_03_006
  deliverable: "03"
  profile: "asset"
  api_call:
    model: "ChatGPT Images 2.5 via the Codex built-in image_gen tool (inferred: the tool reports no model id; codex-cli 0.159.2, transparent_background: true)"
    size: "auto"
  style_ref: "images/IMG_02_003.png"
  location: "party grid game card (src/pages/c/[category].astro, .game-card), dice-loser - wired 2026-10-04 as /art/dice-loser.webp via the dice-loser module cardArt field"
  direction: "C - soft 3D toy"
  purpose: "dice-loser card art in direction C (gh#242)."
  prompt: |
    Scene: a game-card illustration for the game grid of a Thai party-game website — one isolated subject that names the game at a glance, isolated on a fully transparent background.

    Subject: three chunky rounded toy dice tumbling together in mid-air, each at a different angle, soft rounded cubes with round inset pips. The pips are round dots only, never numerals. Subject colours: dice body clean off-white (#f8fafc) with soft cool shading (#94a3b8), pips deep indigo (#1e1b4b), one die's pips red (#ef4444) instead, a soft lavender (#a78bfa) tint in the shaded creases. Every part is solid and opaque, with crisp edges: no glow, no soft mist, no haze, no motion blur. Nothing else in frame: no table, no cup, no hands, no ground, no props.

    Style/medium: SOFT 3D TOY RENDER — a rounded vinyl or clay toy with smooth satin, lightly clear-coated surfaces, soft volumetric shading, gentle ambient occlusion in the creases, a soft studio key light from the upper left with a soft fill, small soft specular highlights on the subject's glossy parts, like a premium designer toy or a modern 3D mobile-game mascot. NOT photorealistic, NO realistic surface texture, NO ink outline, NOT flat vector, NOT a sticker.

    Composition/framing: one subject, centred with even margin on all four sides, square 1:1 aspect, the whole subject inside the frame with nothing cropped, readable as a small thumbnail.

    Color palette: the subject's own material colours named in Subject, saturated but softly lit; no colour grade over the whole image and no coloured rim light from an environment; coral (#f89880) never as a large area, because the card the art sits on is coral.

    Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO hands, NO faces of people, NO logos, NO brand marks, NO watermarks, NO text, NO letters, NO numbers. NO cast shadow or contact shadow beneath the subject, NO floor, NO reflection.
  status: "pending"
  output_path: "images/IMG_03_006.png"
  sha256_master: "835610b374fec68e065981b8820c4d944847c00540759af25bf0204416ee8065"
  ship_derivative: "images/gh242-ship/IMG_03_006.webp"
  notes: "Bare codex exec with -i images/IMG_02_003.png. 1 image_gen call(s); the master is call 1, matched by sha256 (as-sent-prompts.json). Raw: 59.07% fully transparent, 2096 haze px outside the dilated solid mask. Level remap black point 3 -> haze 0. Ship webp 308x320, 18836 bytes, decoded: haze 0, corners 0/0/0/0, 35.84% transparent. Look check (flattened on #f89880 and #1a1a1a): no fringe or halo, no text, letters or numerals, no bottle/can/glass, no human or hand."

- id: IMG_03_007
  deliverable: "03"
  profile: "asset"
  api_call:
    model: "ChatGPT Images 2.5 via the Codex built-in image_gen tool (inferred: the tool reports no model id; codex-cli 0.159.2, transparent_background: true)"
    size: "auto"
  style_ref: "images/IMG_02_003.png"
  location: "party grid game card (src/pages/c/[category].astro, .game-card), how-close-is-near - wired 2026-10-04 as /art/how-close-is-near.webp via the how-close-is-near module cardArt field"
  direction: "C - soft 3D toy"
  purpose: "how-close-is-near card art in direction C (gh#242)."
  prompt: |
    Scene: a game-card illustration for the game grid of a Thai party-game website — one isolated subject that names the game at a glance, isolated on a fully transparent background.

    Subject: a chunky round toy target board seen from a front three-quarter view, standing on a small stubby stand, with thick glossy concentric rings and one soft toy dart with a rounded suction-cup tip stuck near the centre, just off the bullseye. The board carries no numbers and no markings other than the rings. Subject colours: rings alternating indigo (#6366f1) and pale periwinkle (#a5b4fc), bullseye pink (#ec4899), dart body soft red (#f87171) with a pink flight (#f472b6), stand slate grey (#94a3b8). Every part is solid and opaque, with crisp edges: no glow, no soft mist, no haze, no motion blur. Nothing else in frame: no hands, no wall, no ground, no props.

    Style/medium: SOFT 3D TOY RENDER — a rounded vinyl or clay toy with smooth satin, lightly clear-coated surfaces, soft volumetric shading, gentle ambient occlusion in the creases, a soft studio key light from the upper left with a soft fill, small soft specular highlights on the subject's glossy parts, like a premium designer toy or a modern 3D mobile-game mascot. NOT photorealistic, NO realistic surface texture, NO ink outline, NOT flat vector, NOT a sticker.

    Composition/framing: one subject, centred with even margin on all four sides, square 1:1 aspect, the whole subject inside the frame with nothing cropped, readable as a small thumbnail.

    Color palette: the subject's own material colours named in Subject, saturated but softly lit; no colour grade over the whole image and no coloured rim light from an environment; coral (#f89880) never as a large area, because the card the art sits on is coral.

    Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO hands, NO faces of people, NO logos, NO brand marks, NO watermarks, NO text, NO letters, NO numbers. NO cast shadow or contact shadow beneath the subject, NO floor, NO reflection.
  status: "pending"
  output_path: "images/IMG_03_007.png"
  sha256_master: "1d1114c6776a8167b0ef83758fe2401d7e5099bfb9afddff574a06664ec64156"
  ship_derivative: "images/gh242-ship/IMG_03_007.webp"
  notes: "Bare codex exec with -i images/IMG_02_003.png. 2 image_gen call(s); the master is call 2, matched by sha256 (as-sent-prompts.json). Raw: 67.44% fully transparent, 2454 haze px outside the dilated solid mask. Level remap black point 3 -> haze 0. Ship webp 310x320, 20358 bytes, decoded: haze 0, corners 0/0/0/0, 32.84% transparent. Look check (flattened on #f89880 and #1a1a1a): no fringe or halo, no text, letters or numerals, no bottle/can/glass, no human or hand."

- id: IMG_03_008
  deliverable: "03"
  profile: "asset"
  api_call:
    model: "ChatGPT Images 2.5 via the Codex built-in image_gen tool (inferred: the tool reports no model id; codex-cli 0.159.2, transparent_background: true)"
    size: "auto"
  style_ref: "images/IMG_02_003.png"
  location: "party grid game card (src/pages/c/[category].astro, .game-card), pinocchio-luck - wired 2026-10-04 as /art/pinocchio-luck.webp via the pinocchio-luck module cardArt field"
  direction: "C - soft 3D toy"
  purpose: "pinocchio-luck card art in direction C (gh#242)."
  prompt: |
    Scene: a game-card illustration for the game grid of a Thai party-game website — one isolated subject that names the game at a glance, isolated on a fully transparent background.

    Subject: a chubby egg-shaped wooden toy figure seen from a front three-quarter view, smooth and rounded like a turned-wood desk toy, two simple round glossy dot eyes, and a very long pointed wooden nose sticking straight out to one side with a tiny green leaf sprouting from its tip. It is a simple abstract wooden toy with no mouth, no ears, no hair, no hat, no clothes, no limbs and no strings, and not any known character. Subject colours: wood warm light tan (#dca177) with lighter highlights (#f7d2b5) and a soft darker band at the base (#b07a4f), eyes dark brown (#5a301c) with white catch-lights, leaf green (#22c55e), a small berry-red (#881b40) painted ring around the base. Every part is solid and opaque, with crisp edges: no glow, no soft mist, no haze, no motion blur. Nothing else in frame: no stand, no hands, no ground, no props.

    Style/medium: SOFT 3D TOY RENDER — a rounded vinyl or clay toy with smooth satin, lightly clear-coated surfaces, soft volumetric shading, gentle ambient occlusion in the creases, a soft studio key light from the upper left with a soft fill, small soft specular highlights on the subject's glossy parts, like a premium designer toy or a modern 3D mobile-game mascot. NOT photorealistic, NO realistic surface texture, NO ink outline, NOT flat vector, NOT a sticker.

    Composition/framing: one subject, centred with even margin on all four sides, square 1:1 aspect, the whole subject inside the frame with nothing cropped, readable as a small thumbnail.

    Color palette: the subject's own material colours named in Subject, saturated but softly lit; no colour grade over the whole image and no coloured rim light from an environment; coral (#f89880) never as a large area, because the card the art sits on is coral.

    Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO hands, NO faces of people, NO logos, NO brand marks, NO watermarks, NO text, NO letters, NO numbers. NO cast shadow or contact shadow beneath the subject, NO floor, NO reflection.
  status: "pending"
  output_path: "images/IMG_03_008.png"
  sha256_master: "f99de99f687713b2f9347f57d4d47f05b6d7054aa68559013ae4bd3e28e10045"
  ship_derivative: "images/gh242-ship/IMG_03_008.webp"
  notes: "Bare codex exec with -i images/IMG_02_003.png. 2 image_gen call(s); the master is call 2, matched by sha256 (as-sent-prompts.json). Raw: 69.79% fully transparent, 3810 haze px outside the dilated solid mask. Level remap black point 2 -> haze 0. Ship webp 448x320, 15962 bytes, decoded: haze 0, corners 0/0/0/0, 47.10% transparent. Look check (flattened on #f89880 and #1a1a1a): no fringe or halo, no text, letters or numerals, no bottle/can/glass, no human or hand."

- id: IMG_03_009
  deliverable: "03"
  profile: "asset"
  api_call:
    model: "ChatGPT Images 2.5 via the Codex built-in image_gen tool (inferred: the tool reports no model id; codex-cli 0.159.2, transparent_background: true)"
    size: "auto"
  style_ref: "images/IMG_02_003.png"
  location: "party grid game card (src/pages/c/[category].astro, .game-card), cursed-number - wired 2026-10-04 as /art/cursed-number.webp via the cursed-number module cardArt field"
  direction: "C - soft 3D toy"
  purpose: "cursed-number card art in direction C (gh#242)."
  prompt: |
    Scene: a game-card illustration for the game grid of a Thai party-game website — one isolated subject that names the game at a glance, isolated on a fully transparent background.

    Subject: a cursed lottery ball, a glossy round ball seen from a front three-quarter view with two small cute rounded devil horns on top and a short pointed devil tail curling out from behind. The ball's surface is completely blank, with no numeral, no letter and no marking of any kind. Subject colours: ball deep purple (#a855f7) with soft violet highlights (#d8b4fe), horns and tail red (#ef4444), a small magenta (#ec4899) highlight on the horn tips. Every part is solid and opaque, with crisp edges: no glow, no soft mist, no haze, no motion blur. Nothing else in frame: no other balls, no machine, no ground, no props.

    Style/medium: SOFT 3D TOY RENDER — a rounded vinyl or clay toy with smooth satin, lightly clear-coated surfaces, soft volumetric shading, gentle ambient occlusion in the creases, a soft studio key light from the upper left with a soft fill, small soft specular highlights on the subject's glossy parts, like a premium designer toy or a modern 3D mobile-game mascot. NOT photorealistic, NO realistic surface texture, NO ink outline, NOT flat vector, NOT a sticker.

    Composition/framing: one subject, centred with even margin on all four sides, square 1:1 aspect, the whole subject inside the frame with nothing cropped, readable as a small thumbnail.

    Color palette: the subject's own material colours named in Subject, saturated but softly lit; no colour grade over the whole image and no coloured rim light from an environment; coral (#f89880) never as a large area, because the card the art sits on is coral.

    Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO hands, NO faces of people, NO logos, NO brand marks, NO watermarks, NO text, NO letters, NO numbers. NO cast shadow or contact shadow beneath the subject, NO floor, NO reflection.
  status: "pending"
  output_path: "images/IMG_03_009.png"
  sha256_master: "221e6646d746641180810175c8dfc205f54d11e544dd79aa619de4f7e5d406df"
  ship_derivative: "images/gh242-ship/IMG_03_009.webp"
  notes: "Bare codex exec with -i images/IMG_02_003.png. 1 image_gen call(s); the master is call 1, matched by sha256 (as-sent-prompts.json). Raw: 55.02% fully transparent, 1951 haze px outside the dilated solid mask. Level remap black point 4 -> haze 0. Ship webp 367x320, 15884 bytes, decoded: haze 0, corners 0/0/0/0, 34.49% transparent. Look check (flattened on #f89880 and #1a1a1a): no fringe or halo, no text, letters or numerals, no bottle/can/glass, no human or hand."

- id: IMG_03_010
  deliverable: "03"
  profile: "asset"
  api_call:
    model: "ChatGPT Images 2.5 via the Codex built-in image_gen tool (inferred: the tool reports no model id; codex-cli 0.159.2, transparent_background: true)"
    size: "auto"
  style_ref: "images/IMG_02_003.png"
  location: "party grid game card (src/pages/c/[category].astro, .game-card), wire-snip-panic - wired 2026-10-04 as /art/wire-snip-panic.webp via the wire-snip-panic module cardArt field"
  direction: "C - soft 3D toy"
  purpose: "wire-snip-panic card art in direction C (gh#242)."
  prompt: |
    Scene: a game-card illustration for the game grid of a Thai party-game website — one isolated subject that names the game at a glance, isolated on a fully transparent background.

    Subject: a chunky toy bomb-defusal box seen from a front three-quarter view, a small rounded rectangular case with three thick glossy coloured wires looping out of its top and back in, a pair of chunky rounded toy scissors with big round handles about to snip one wire, and one small round warning light on the box. The box carries no screen, no digits, no text and no labels. Subject colours: box dark charcoal (#111827) with soft grey highlights (#374151), wires red (#ef4444), amber (#f59e0b) and cyan (#06b6d4), scissors handles green (#10b981) with silver-white blades (#e5e7eb), warning light orange (#f97316). Every part is solid and opaque, with crisp edges: no glow, no soft mist, no haze, no motion blur. Nothing else in frame: no hands, no explosion, no ground, no props.

    Style/medium: SOFT 3D TOY RENDER — a rounded vinyl or clay toy with smooth satin, lightly clear-coated surfaces, soft volumetric shading, gentle ambient occlusion in the creases, a soft studio key light from the upper left with a soft fill, small soft specular highlights on the subject's glossy parts, like a premium designer toy or a modern 3D mobile-game mascot. NOT photorealistic, NO realistic surface texture, NO ink outline, NOT flat vector, NOT a sticker.

    Composition/framing: one subject, centred with even margin on all four sides, square 1:1 aspect, the whole subject inside the frame with nothing cropped, readable as a small thumbnail.

    Color palette: the subject's own material colours named in Subject, saturated but softly lit; no colour grade over the whole image and no coloured rim light from an environment; coral (#f89880) never as a large area, because the card the art sits on is coral.

    Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO hands, NO faces of people, NO logos, NO brand marks, NO watermarks, NO text, NO letters, NO numbers. NO cast shadow or contact shadow beneath the subject, NO floor, NO reflection.
  status: "pending"
  output_path: "images/IMG_03_010.png"
  sha256_master: "dbdded6673bf1eac853d81b5c70ae1024175c0f65a1e02f583496dba6cd8bd6f"
  ship_derivative: "images/gh242-ship/IMG_03_010.webp"
  notes: "Bare codex exec with -i images/IMG_02_003.png. 2 image_gen call(s); the master is call 2, matched by sha256 (as-sent-prompts.json). Raw: 63.13% fully transparent, 5904 haze px outside the dilated solid mask. Level remap black point 4 -> haze 0. Ship webp 264x320, 20310 bytes, decoded: haze 0, corners 0/0/0/0, 37.01% transparent. Look check (flattened on #f89880 and #1a1a1a): no fringe or halo, no text, letters or numerals, no bottle/can/glass, no human or hand."

- id: IMG_03_011
  deliverable: "03"
  profile: "asset"
  api_call:
    model: "ChatGPT Images 2.5 via the Codex built-in image_gen tool (inferred: the tool reports no model id; codex-cli 0.159.2, transparent_background: true)"
    size: "auto"
  style_ref: "images/IMG_02_003.png"
  location: "party grid game card (src/pages/c/[category].astro, .game-card), zero-trigger - wired 2026-10-04 as /art/zero-trigger.webp via the zero-trigger module cardArt field"
  direction: "C - soft 3D toy"
  purpose: "zero-trigger card art in direction C (gh#242)."
  prompt: |
    Scene: a game-card illustration for the game grid of a Thai party-game website — one isolated subject that names the game at a glance, isolated on a fully transparent background.

    Subject: a chunky round toy stopwatch seen from a front three-quarter view, a glossy rounded case with a big round button on top and a small side button, a clear rounded dome cover over a plain blank dial with one thick hand. The dial carries no numerals, no tick marks and no text. Subject colours: case warm yellow (#fbbf24) with soft highlights (#fde68a), top button red (#ef4444), side button cyan (#06b6d4), dial pale grey-white (#f1f5f9) with a soft blue rim (#38bdf8), hand slate (#475569). Every part is solid and opaque, with crisp edges: no glow, no soft mist, no haze, no motion blur. Nothing else in frame: no hands, no chain, no ground, no props.

    Style/medium: SOFT 3D TOY RENDER — a rounded vinyl or clay toy with smooth satin, lightly clear-coated surfaces, soft volumetric shading, gentle ambient occlusion in the creases, a soft studio key light from the upper left with a soft fill, small soft specular highlights on the subject's glossy parts, like a premium designer toy or a modern 3D mobile-game mascot. NOT photorealistic, NO realistic surface texture, NO ink outline, NOT flat vector, NOT a sticker.

    Composition/framing: one subject, centred with even margin on all four sides, square 1:1 aspect, the whole subject inside the frame with nothing cropped, readable as a small thumbnail.

    Color palette: the subject's own material colours named in Subject, saturated but softly lit; no colour grade over the whole image and no coloured rim light from an environment; coral (#f89880) never as a large area, because the card the art sits on is coral.

    Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO hands, NO faces of people, NO logos, NO brand marks, NO watermarks, NO text, NO letters, NO numbers. NO cast shadow or contact shadow beneath the subject, NO floor, NO reflection.
  status: "pending"
  output_path: "images/IMG_03_011.png"
  sha256_master: "2fb622ad51780d953eecc8d292d2b6681fe1778f48c51e1aeed11eed8f487ca7"
  ship_derivative: "images/gh242-ship/IMG_03_011.webp"
  notes: "Bare codex exec with -i images/IMG_02_003.png. 2 image_gen call(s); the master is call 2, matched by sha256 (as-sent-prompts.json). Raw: 50.96% fully transparent, 3105 haze px outside the dilated solid mask. Level remap black point 2 -> haze 0. Ship webp 280x320, 18440 bytes, decoded: haze 0, corners 0/0/0/0, 30.38% transparent. Look check (flattened on #f89880 and #1a1a1a): no fringe or halo, no text, letters or numerals, no bottle/can/glass, no human or hand."

- id: IMG_03_012
  deliverable: "03"
  profile: "asset"
  api_call:
    model: "ChatGPT Images 2.5 via the Codex built-in image_gen tool (inferred: the tool reports no model id; codex-cli 0.159.2, transparent_background: true)"
    size: "auto"
  style_ref: "images/IMG_02_003.png"
  location: "party grid game card (src/pages/c/[category].astro, .game-card), one-bomb - wired 2026-10-04 as /art/one-bomb.webp via the one-bomb module cardArt field"
  direction: "C - soft 3D toy"
  purpose: "one-bomb card art in direction C (gh#242)."
  prompt: |
    Scene: a game-card illustration for the game grid of a Thai party-game website — one isolated subject that names the game at a glance, isolated on a fully transparent background.

    Subject: a small tilted square toy board of nine rounded stone tiles in a three-by-three grid, seen from a front three-quarter view above, one tile flipped up on its edge to reveal a small cute round bomb with a short fuse peeking out of the hole beneath it. The tiles carry no numbers and no markings. Subject colours: tiles soft blue-grey stone (#8fa7bf) with pale highlights (#e2effa), board frame deep blue (#3d5b7d), bomb body dark slate (#334155) with a bright orange spark (#ff9500) at the fuse tip, one tiny green accent (#2ed573) on the board frame's corner. Every part is solid and opaque, with crisp edges: no glow, no soft mist, no haze, no motion blur. Nothing else in frame: no hands, no explosion, no ground, no props.

    Style/medium: SOFT 3D TOY RENDER — a rounded vinyl or clay toy with smooth satin, lightly clear-coated surfaces, soft volumetric shading, gentle ambient occlusion in the creases, a soft studio key light from the upper left with a soft fill, small soft specular highlights on the subject's glossy parts, like a premium designer toy or a modern 3D mobile-game mascot. NOT photorealistic, NO realistic surface texture, NO ink outline, NOT flat vector, NOT a sticker.

    Composition/framing: one subject, centred with even margin on all four sides, square 1:1 aspect, the whole subject inside the frame with nothing cropped, readable as a small thumbnail.

    Color palette: the subject's own material colours named in Subject, saturated but softly lit; no colour grade over the whole image and no coloured rim light from an environment; coral (#f89880) never as a large area, because the card the art sits on is coral.

    Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO hands, NO faces of people, NO logos, NO brand marks, NO watermarks, NO text, NO letters, NO numbers. NO cast shadow or contact shadow beneath the subject, NO floor, NO reflection.
  status: "pending"
  output_path: "images/IMG_03_012.png"
  sha256_master: "97734bd3e5610ed5078ef4d1cca70da6656712c90d172b057b01b68d1adbe67e"
  ship_derivative: "images/gh242-ship/IMG_03_012.webp"
  notes: "Bare codex exec with -i images/IMG_02_003.png. 2 image_gen call(s); the master is call 2, matched by sha256 (as-sent-prompts.json). Raw: 51.41% fully transparent, 1922 haze px outside the dilated solid mask. Level remap black point 3 -> haze 0. Ship webp 390x320, 21058 bytes, decoded: haze 0, corners 0/0/0/0, 31.94% transparent. Look check (flattened on #f89880 and #1a1a1a): no fringe or halo, no text, letters or numerals, no bottle/can/glass, no human or hand."

- id: IMG_03_013
  deliverable: "03"
  profile: "asset"
  api_call:
    model: "ChatGPT Images 2.5 via the Codex built-in image_gen tool (inferred: the tool reports no model id; codex-cli 0.159.2, transparent_background: true)"
    size: "auto"
  style_ref: "images/IMG_02_003.png"
  location: "party grid game card (src/pages/c/[category].astro, .game-card), bangkok-drift - wired 2026-10-04 as /art/bangkok-drift.webp via the bangkok-drift module cardArt field"
  direction: "C - soft 3D toy"
  purpose: "bangkok-drift card art in direction C (gh#242)."
  prompt: |
    Scene: a game-card illustration for the game grid of a Thai party-game website — one isolated subject that names the game at a glance, isolated on a fully transparent background.

    Subject: a chubby toy red sports car seen from a front three-quarter view, mid-drift with its rear swung out and two small solid rounded clay-like puffs of tyre smoke at the rear wheels, rounded toy proportions with big wheels and a short body. No licence plate, no number, no badge, no logo, no text and no driver visible; the windows are tinted dark. Subject colours: body glossy red (#ef4444) with soft pink highlights (#fca5a5), windows dark navy tint (#070c14), wheels dark (#1f2937) with silver hubs (#e5e7eb), headlights warm yellow (#facc15), smoke puffs solid pale grey-white (#f8fafc). Every part is solid and opaque, with crisp edges: no glow, no soft mist, no haze, no motion blur. Nothing else in frame: no road, no track, no buildings, no ground, no props.

    Style/medium: SOFT 3D TOY RENDER — a rounded vinyl or clay toy with smooth satin, lightly clear-coated surfaces, soft volumetric shading, gentle ambient occlusion in the creases, a soft studio key light from the upper left with a soft fill, small soft specular highlights on the subject's glossy parts, like a premium designer toy or a modern 3D mobile-game mascot. NOT photorealistic, NO realistic surface texture, NO ink outline, NOT flat vector, NOT a sticker.

    Composition/framing: one subject, centred with even margin on all four sides, square 1:1 aspect, the whole subject inside the frame with nothing cropped, readable as a small thumbnail.

    Color palette: the subject's own material colours named in Subject, saturated but softly lit; no colour grade over the whole image and no coloured rim light from an environment; coral (#f89880) never as a large area, because the card the art sits on is coral.

    Constraints: NO background of any kind — no scenery, no solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha channel. NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO hands, NO faces of people, NO logos, NO brand marks, NO watermarks, NO text, NO letters, NO numbers. NO cast shadow or contact shadow beneath the subject, NO floor, NO reflection.
  status: "pending"
  output_path: "images/IMG_03_013.png"
  sha256_master: "629d8e96a897f9d5b19635b9620648541895bf4712d82e8a5abf59e55de0cac8"
  ship_derivative: "images/gh242-ship/IMG_03_013.webp"
  notes: "Bare codex exec with -i images/IMG_02_003.png. 3 image_gen call(s); the master is call 3, matched by sha256 (as-sent-prompts.json). Raw: 62.87% fully transparent, 1922 haze px outside the dilated solid mask. Level remap black point 2 -> haze 0. Ship webp 468x320, 29328 bytes, decoded: haze 0, corners 0/0/0/0, 33.43% transparent. Look check (flattened on #f89880 and #1a1a1a): no fringe or halo, no text, letters or numerals, no bottle/can/glass, no human or hand."

```
