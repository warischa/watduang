# Landing Page Redesign — Playful Arcade

Status: Draft concept
Reference: Generated concept #1 (Playful Arcade)
Target: `/`

## Goal

Reframe วัดดวง as a fast Thai entertainment hub where visitors immediately understand the three things they can do:

1. Play party chance games with a group.
2. Open a solo fortune experience.
3. Use an instant randomizer tool.

The landing page should feel playful and energetic without implying that every section is a multiplayer game.

## Design direction

### Mood

- Playful arcade, friendly, bright, slightly nostalgic.
- Thick outlines and rounded surfaces.
- Flat illustration over photorealism.
- Strong visual hierarchy rather than dense navigation.
- Fun enough for party use, but not visually tied only to party games.

### Core palette

Use existing tokens where possible. Suggested visual mapping:

- Warm cream background: `#FFF8E8`
- Ink / outline: `#17213A`
- Primary coral: `#F54867`
- Gold: `#FFC84D`
- Sky blue: `#50A8F5`
- Lavender: `#A678F4`
- Mint: `#6FD0B1`

The final implementation should map these to existing CSS custom properties rather than introducing arbitrary literals unless the design system needs a deliberate new token.

### Typography

- Thai display heading: rounded, heavy, high personality.
- Body: simple Thai sans-serif with high legibility.
- Hero heading should stay readable at 320px and avoid line lengths that force awkward Thai wraps.

## Information architecture

### 1. Header

Minimal top navigation:

- Logo: วัดดวง
- เกมปาร์ตี้
- ดูดวง
- เครื่องมือสุ่ม

Optional secondary links should not compete with the three primary intents.

### 2. Hero

Primary message:

> กดทีเดียว รู้เลยว่าใครโดน

Supporting copy:

> เกมปาร์ตี้ ดูดวง และเครื่องมือสุ่ม ใช้ฟรีบนเว็บ ไม่ต้องโหลดแอป

Primary CTA:

- `เล่นเกมสุ่มคนโดน` → `/c/party/`

Secondary CTA:

- `ใช้เครื่องมือสุ่ม` → `/tools/`

Tertiary text link:

- `อยากดูดวง →` → `/c/fortune/`

Hero illustration:

- Large colorful wheel.
- Mascot or abstract luck character.
- Decorative stars, dice, question marks, cards.
- Do not include alcohol bottles/cans/branded glasses.

### 3. Popular row

Purpose: fast entry for returning or indecisive visitors.

Heading:

- `ยอดนิยม`

Data source:

- Existing `popularGames` manifest data only.
- No fabricated play counts, rankings, or social proof.

Card anatomy:

- Game name.
- One-line tagline.
- Category chip.
- Strong whole-card click target.

### 4. Three intent panels

Present three clearly separate blocks.

#### เกมปาร์ตี้

Copy direction:

> เกมสำหรับวงเพื่อน ให้ดวงตัดสินว่าใครโดน

Destination:

- `/c/party/`

#### ดูดวง

Copy direction:

> เปิดคำทำนายสำหรับตัวเอง อ่านจบในหน้าเดียว

Destination:

- `/c/fortune/`

Important: never describe this section as a multiplayer game, shared roster, or phone-passing flow.

#### เครื่องมือสุ่ม

Copy direction:

> สุ่มชื่อ แบ่งทีม จับฉลาก หรือสุ่มเลขแบบทันที

Destination:

- `/tools/`

Important: tools do not share the game roster/session.

### 5. How it works

The current site-wide three-step party flow is too narrow. Replace it with a neutral flow that fits all intents:

1. `เลือกสิ่งที่อยากเล่น`
2. `กดเริ่มหรือใส่ข้อมูลที่จำเป็น`
3. `รับผลลัพธ์ทันที`

Do not mention player count, roster entry, or phone passing at this site-wide level.

### 6. Trust / product facts

Only state facts supported by the current product:

- ใช้ฟรี
- ไม่ต้องสมัคร
- เปิดในเบราว์เซอร์ได้เลย
- รองรับมือถือ

Avoid invented metrics, reviews, accuracy claims, or user-count claims.

### 7. FAQ

Suggested questions:

- ต้องโหลดแอปไหม
- ต้องสมัครไหม
- เล่นฟรีไหม
- เกมปาร์ตี้ต่างจากดูดวงและเครื่องมือสุ่มยังไง

The final FAQ copy should be source-bound to current product behavior.

## UX principles

### Fast intent recognition

A first-time visitor should distinguish the three product types in under a few seconds.

### Whole-card navigation

Cards should be large tap targets with no small nested controls unless necessary.

### Mobile first

At <= 640px:

- Single-column hero.
- Hero wheel below copy.
- CTAs stack vertically.
- Popular cards can become horizontal scroll or a compact 1-column list.
- Intent panels become one column.
- No horizontal page overflow at 320px.

### Motion

Allowed:

- Gentle wheel drift.
- Small card bob.
- Decorative sparkle movement.

Under `prefers-reduced-motion: reduce`, all decorative motion stops.

### Ads

Ad placements should reserve their dimensions before load and should never appear inside a live play surface.

## SEO direction

The homepage title/description must describe the three intents without applying party-only claims to the entire site.

Draft title:

> วัดดวง — เกมปาร์ตี้ ดูดวง และเครื่องมือสุ่มใช้ฟรี

Draft description:

> รวมเกมสุ่มคนโดน ดูดวง และเครื่องมือสุ่ม ใช้ฟรีบนเว็บ เปิดได้ทันที ไม่ต้องโหลดแอปหรือสมัครสมาชิก

## Implementation notes

- Reuse `categories`, `popularGames`, `popularGroup`, `tools`, and `toolsGroup` as data sources.
- Avoid hardcoding catalogue names in the page where manifest data already exists.
- Preserve static routing and pure-static build output.
- No inline runtime scripts.
- Keep navigation anchors outside live play surfaces.
- Final production implementation should use existing tokens and shared components where practical.

## Draft page structure

```text
Header
Hero
  copy
  CTA group
  wheel / mascot art
Popular row
Intent panels
  Party
  Fortune
  Tools
How it works
Product facts
FAQ
Footer
```

## Non-goals for this draft

- No account/login system.
- No favorites system.
- No fake reviews or user metrics.
- No coin economy or paid features.
- No new backend behavior.
- No change to game/session mechanics.
