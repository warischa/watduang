# Assets: where art, share cards and models live

Read this before adding ANY binary to the repo — an image, a font, a 3D model, an audio file.

`public/` is a **publish surface, not a scratch directory**. Astro copies it verbatim into `dist/`, so a
file dropped there ships to the live site on the next build whether or not anything references it. That
has already happened once: an image-generation tool wrote a 1.1 MB PNG into `public/` unasked, and it
was only caught because someone listed the directory by hand. Nothing in CI would have said a word.

## Where each thing lives

| What | Home | Published? | Who makes it |
|---|---|---|---|
| Share card (OG) | `public/og/<game-id>.png`, plus `site.png` for every non-game page | yes | `scripts/make-og.mjs` — never by hand, never by an image model |
| Icons, motifs, decorative shapes | inline SVG in the component that draws it — **no file at all** | as markup | written by hand |
| Raster art the browser loads | `public/art/<name>.png` | yes | only when code genuinely cannot draw it |
| 3D model or texture | `public/models/<game-id>/` | yes | loaded by dynamic import on that one game's page only |
| Design sources (`.dc.html`, canvas manifest) | `design/` | **no** | design canvas; committed as source, never referenced at runtime |
| Generated-art provenance | `images/IMAGES.md` | no | create it with the first approved generated asset, not before |

`public/art/` and `public/models/` do not exist yet, and should be created by the first ticket that
genuinely needs one — not in advance. An empty directory is not structure, it is a promise nobody kept.

## The rules

**1. Draw it in code first.** Every icon, badge, motif and diagram on this site is inline SVG today, and
that is the default, not an accident: SVG costs a few hundred bytes, recolours from tokens, scales to
any density, and animates. A game page currently ships well under 10 KB of JavaScript — a single
1536×1024 PNG is roughly a hundred times the whole page. Reach for a raster only when the thing cannot
be drawn: photographic texture, painterly illustration, a real photo.

**2. Generated art must be a transparent cutout.** An asset with a background colour baked into its
pixels is wrong twice: it ships a copy of a token that will drift the day the theme changes, and it
cannot be reused on any other surface. Ask for transparency in the prompt itself — that is what actually
produces alpha; there is no parameter for it on the CLI path. State it as both a requirement and an
exclusion:

> isolated on a fully transparent background … Constraints: NO background of any kind — no scenery, no
> solid backdrop, no gradient, no checkerboard pattern, no drop shadow. The PNG must have a true alpha
> channel.

**Then verify it, every time** — the feature is in preview and a render can silently come back opaque:

```bash
magick <file> -alpha extract -format '%[fx:mean]\n' info:   # must print < 1; exactly 1 means NO transparency
magick identify -format '%[channels]\n' <file>              # must say srgba, not srgb
magick <file> -trim +repage <file>                          # strip transparent padding before use
```

If a render comes back opaque twice, fall back to chroma-key: ask for a flat pure green backdrop, then
`magick in.png -fuzz 8% -transparent '#00FF00' out.png`, and check the edges over a dark ground for a
green halo.

**3. Content rules apply to every asset, generated or drawn.** No bottles, no cans, no branded
glassware, anywhere — share cards and thumbnails included. That is the Thai Alcohol Act line from
`CLAUDE.md`, and an image model will happily produce all three from a prompt about a party. Put the
exclusion in the prompt AND look at the result before it is used:

> Constraints: NO bottles, NO cans, NO drinking glasses, NO alcohol of any kind, NO human figures, NO
> faces, NO logos, NO brand marks.

**4. Never trust "ran clean" for an image.** Two separate failure modes on this machine produce a
zero exit code and a broken file: Thai vowels shattering into dotted circles in an OG card (see
`docs/runbook.md`), and an opaque render where a cutout was asked for. Open the file and look at it.

**5. Pick a generated file by its content hash, not by its timestamp.** A generation run can leave
several candidates behind; the newest by modification time is not necessarily the one the run
designated. Match the hash the run reports.

**6. Every published binary needs a referrer.** Before committing a file under `public/`, something in
`src/` or a manifest must point at it. `scripts/validate-games.mjs` already fails the build when a game's
declared share card is missing — the opposite direction, a file that ships with nothing pointing at it,
is currently unguarded. Until a gate exists, this is a rule an author keeps, not one CI keeps.

## Size ceilings

Proposed, not yet enforced — a shipping raster over its ceiling is a review conversation, not an
automatic refusal:

| Asset | Ceiling | Why |
|---|---|---|
| Share card | ~80 KB | never fetched by a player, only by a crawler or a chat app unfurling a link |
| Raster art on a page | 60 KB | the whole point of this site is that it opens instantly while a group waits |
| 3D model + textures for one game | 400 KB | loaded only on that game's page, only after the player opts in |

Generate large, then downsample on the way out — `sips -Z <max-dim>` or `magick <in> -resize <w>x <out>`
are both on this machine, as is `rsvg-convert`, which is the proven path for anything carrying Thai text.
