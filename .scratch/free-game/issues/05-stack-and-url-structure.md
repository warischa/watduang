# 05 — Tech stack + โครงสร้าง URL และหน้าหมวด

Type: grilling
Status: resolved
Blocked by: —

## Question

สองเรื่องนี้เป็นการตัดสินใจเดียวกัน เพราะข้อกำหนด SEO เป็นตัวเลือก stack ไม่ใช่ความชอบ

**ข้อกำหนดที่รู้แล้ว:**
- 1 เกม = 1 URL ที่ Google index ได้ (แบบ PiliApp) — SPA URL เดียวคือฆ่าตัวตาย
- ต้องมี**หน้าหมวดแยก**: `เกมสันทนาการ` / `เกมเข้าค่าย` / `เกมกลุ่ม` / `เกมวัดดวง` เพราะแบรนด์ชื่อ "วัดดวง" ครอบคำพวกนี้ไม่ได้เอง
- ไม่มี backend, host ฟรีหรือเกือบฟรี
- โหลดเร็วบนมือถือไทย (Core Web Vitals กระทบทั้งอันดับและรายได้โฆษณา)
- ต้องไม่ปิดประตูใส่ multi-device ในเฟสหน้า

**สิ่งที่ต้องตัดสิน:** static site generator ตัวไหน (หรือ HTML ล้วน), โครง URL, หน้าหมวดสร้างยังไง, deploy ที่ไหน, ภาษาอังกฤษทีหลังจะอยู่ใน path ไหน

**ระวัง:** อย่าเลือก framework เพราะคุ้นมือ เว็บนี้คือหน้า static ~10 หน้ากับ JS นิดเดียว — เกณฑ์คือ "อะไรที่ทำให้ 1 เกม = 1 หน้า index ได้ ด้วยงานน้อยที่สุด"

## ข้อจำกัดใหม่ (เจ้าของเว็บกำหนด 2026-08-13)

**ต้องรันบน Azure · งบ 6,000 USD/ปี**

ข้อนี้ตัดครึ่งของ ticket จบไปเลย — ครึ่ง "hosting + stack" ตัดสินได้ทันทีโดยไม่ต้องรอ #10 เพราะ Astro/SWA รองรับโครง URL ได้ทุกแบบ · ครึ่งที่ยังติด #10 คือ **หน้าหมวดมีอะไรบ้าง** เท่านั้น

## Answer (ครึ่ง hosting + stack)

### ตัวเลข Azure Static Web Apps ที่ยืนยันแล้ว (CONFIRMED จากหน้า pricing + Learn ของ Microsoft)

| | Free | Standard |
|---|---|---|
| ราคา | **ฟรี** | หน้าเว็บแสดงเป็น `$-` (โหลดด้วย JS) — **ต้องเช็คในพอร์ทัลจริง** |
| Bandwidth | 100 GB/เดือน/subscription | 100 GB รวม + คิดเงินส่วนเกิน |
| Custom domain | 2 ต่อ app | 5 ต่อ app |
| SSL | ฟรี ต่ออายุเอง | เหมือนกัน |
| Globally distributed static content | ✔ | ✔ |
| ขนาด app สูงสุด | 250 MB | 500 MB |
| Azure Functions | Managed | Managed / bring your own |
| **SLA** | **ไม่มี** | มี |

### ⚠ กับดักของ Free ที่ต้องรู้

Microsoft เขียนไว้ตรงๆ: *"In the free plan if your site exceeds the 100 GB quota, **we will not be able to serve your site**"* — **เกินโควตาแล้วเว็บดับ ไม่ใช่ถูกเรียกเก็บเงินเพิ่ม**

100 GB ที่หน้าเว็บขนาด ~300 KB ≈ **330,000 pageview/เดือน** ซึ่งไกลเกินกว่าเว็บใหม่จะแตะได้ในปีแรก แต่ถ้าวันหนึ่งมีคลิปไวรัลพาคนเข้ามา เว็บจะดับ**ในวันที่ traffic ดีที่สุด** ซึ่งเป็นวันที่แพงที่สุดที่จะดับ

### 🎯 Deploy target — ยืนยันแล้ว 2026-08-13

```
subscription  edad4930-c46c-4c78-9362-c75e71a91a35
ชื่อ           Microsoft Azure Sponsorship - Github Copilot Enterprise
tenant        bbf3b249-d680-458b-9ec7-52dba8859dca
```

| ตรวจ | ผล |
|---|---|
| az CLI | 2.86.0 · login `waris.c@kaopanwa.co.th` |
| subscription state | **Enabled** · ตั้งเป็น active แล้ว |
| สิทธิ์ | **Owner** บน subscription (และบน `/`) — สร้างได้ทุกอย่าง |
| `Microsoft.Web` provider | **Registered** — สร้าง Static Web Apps ได้ |
| SWA ที่มีอยู่ | ไม่มี — เว็บนี้จะเป็นตัวแรก |
| region ของ RG เดิม | ส่วนใหญ่ `southeastasia` (สิงคโปร์) — ใกล้ไทยที่สุด ใช้ตามนี้ |

**⚠ สองข้อที่ต้องรู้ ไม่ใช่ตัวขวาง**

1. **subscription ชื่อ "Github Copilot Enterprise"** — เว็บเกมปาร์ตี้ไปเกิดใน sub ที่ชื่อบอกว่าเป็นของ Copilot Enterprise จะดูแปลกตอนมีคนมาไล่บิลทีหลัง ไม่ผิดอะไร แต่ถ้ามี sub ที่ชื่อตรงกว่าก็ควรพิจารณา
2. **เป็น Sponsorship subscription** — ประเภทนี้มีเพดานเครดิตและ**วันหมดอายุ** ซึ่งน่าจะเป็นที่มาของตัวเลข 6,000/ปี **ถ้าสปอนเซอร์หมดอายุ hosting หายไปด้วย** — ข้อนี้เป็นเหตุผลเพิ่มที่ทำให้การออกแบบแบบ static + จุดผูก 2 จุด คุ้มกว่า container จริงๆ ย้ายออกได้ใน 1 ชั่วโมงถ้าวันนั้นมาถึง

*(อ่าน `subscriptionPolicies.quotaId` และ `spendingLimit` ไม่ได้ — query คืนค่าว่าง ไม่ได้เดาแทน ถ้าต้องรู้เพดานจริงต้องดูในพอร์ทัล)*

### เลือก Standard ตั้งแต่วันแรก

_(แก้จากคำแนะนำเดิม "เริ่ม Free ค่อยอัป" — งบ 6,000 เป็น **subscription credit บน Azure โดยเฉพาะ** งบก้อนอื่นแยกต่างหาก และใช้ไม่หมดก็ถือว่าโอเค แปลว่าไม่มีเหตุผลให้ประหยัดค่า hosting เลย ผมแนะนำผิดเพราะไปประหยัดข้อจำกัดที่ไม่มีอยู่)_

เหตุผลเดียวที่ต้องเลือก Standard: Free มีหน้าผาที่ Microsoft เขียนไว้เองว่า *"if your site exceeds the 100 GB quota, **we will not be able to serve your site**"* — **เกินแล้วเว็บดับ ไม่ใช่ถูกเรียกเก็บเพิ่ม** Standard เปลี่ยนหน้าผานั้นเป็นการคิดค่าส่วนเกิน แถม SLA

ถ้าต้องจ่ายเองผมจะบอกให้เริ่ม Free เพราะ 100 GB ≈ 330,000 pageview/เดือน ไกลเกินปีแรก · แต่ในเมื่อ credit มีอยู่แล้วและใช้ไม่หมดก็ไม่เสียหาย การยอมให้เว็บดับในวันที่ traffic ดีที่สุดเพื่อประหยัดเงินที่ไม่ได้เข้ากระเป๋าใคร คือการแลกที่ไม่มีเหตุผล

---

## 📐 Tech stack ฉบับตัดสินแล้ว

เจ้าของเว็บยืนยัน 2026-08-13: *"run อยู่บน Azure แต่สามารถย้ายไป cloud อื่นได้ง่ายไม่ผูกติด ไม่จำเป็นต้องใช้ container"*

| ชั้น | เลือก | เหตุผลที่ไม่เลือกตัวอื่น |
|---|---|---|
| **Static site generator** | **Astro** | path routing + static HTML มาโดยดีฟอลต์ · `getStaticPaths()` อ่าน manifest ปั๊ม 1 เกม 1 HTML · Next.js หนักเกินสำหรับ ~20 หน้า · Eleventy ใช้ได้แต่จัดการ island ไม่ดีเท่า |
| **ภาษา** | **TypeScript** | จับ schema ของไฟล์เกมผิดตั้งแต่ build ไม่ใช่ตอนผู้ใช้เปิดเจอ |
| **Framework ตอน runtime** | **ไม่มี — vanilla TS ใน island** | React กิน ~45KB gzip ทุกหน้าเกมโดยไม่ได้อะไรกลับมา → ตี LCP → ตีทั้งอันดับและรายได้โฆษณา · และเครื่องมือของ Admin Desk เป็น vanilla อยู่แล้ว ยกมาตรงๆ ได้ · **ไม่มี framework = ไม่มีอะไรต้องพอร์ต** |
| **Styling** | **CSS ธรรมดา + custom properties** | ท่าเดียวกับ Admin Desk (`:root` design tokens) ไม่มี build step ไม่มี dep · Tailwind เพิ่ม dep ให้เว็บ 20 หน้า ไม่คุ้ม |
| **คลังคำถาม/คำท้า** | **ไฟล์ข้อมูลแยกจากตรรกะเกม** (JSON/TS) | คนที่ไม่ใช่ dev แก้ได้ AI generate ลงได้ ไม่ต้องแตะโค้ดเกม |
| **Package manager** | **npm** | ไม่ต้องติดตั้งอะไรเพิ่ม |
| **Hosting** | **Azure Static Web Apps — Standard** | Free มีหน้าผาเกินโควตาแล้วเว็บดับ · Standard เปลี่ยนเป็นคิดค่าส่วนเกิน + SLA และ credit มีอยู่แล้ว |
| **CI/CD** | **GitHub Actions** | SWA สร้าง workflow ให้ตอน connect repo · step `npm run build` เป็นกลาง มีแต่ step deploy ที่เป็นของ Azure |
| **Analytics** | **Cloudflare Web Analytics** | ฟรี ~1KB **ไม่ใช้คุกกี้** → ไม่ต้องมีแบนเนอร์ขอความยินยอมเพิ่ม · GA4 หนัก ~50KB และตั้งคุกกี้ ตี CWV สองต่อ *(ความยินยอมของ AdSense เองเป็นคนละเรื่อง อยู่ใน [#07](07-ad-placement.md))* |
| **โฆษณา** | **AdSense Auto ads ใน `GameLayout`** ควบคุมด้วยฟิลด์ `ads` ของไฟล์เกม | ต้องแก้ CSP ให้ผ่านก่อน ไม่งั้นเงียบ |
| **Container** | **ใช้เฉพาะ build + local dev ไม่ใช้เสิร์ฟ** | ดูหัวข้อ vendor lock-in ด้านล่าง |

### ❌ สิ่งที่จงใจไม่มีใน stack

React/Vue/Svelte ตอน runtime · Tailwind · CMS · ฐานข้อมูล · ระบบล็อกอิน · serverless function · container สำหรับเสิร์ฟ · Azure Front Door/CDN · state management library · test framework (มีแค่ smoke check ตัวเดียวใน CI)

ทุกตัวในรายการนี้เพิ่มพื้นผิวที่ต้องพอร์ตตอนย้ายคลาวด์ โดยที่เว็บนี้ยังไม่มีปัญหาที่มันแก้

### Generator: Astro

เกณฑ์คือ "อะไรทำให้ 1 เกม = 1 หน้า index ได้ ด้วยงานน้อยที่สุด" — Astro ตรงเกณฑ์เพราะ **ส่ง JS เป็นศูนย์โดยดีฟอลต์** และใส่ JS เฉพาะตัวเกม (islands) ซึ่งสำคัญกับเว็บนี้เป็นพิเศษ เพราะ Core Web Vitals กระทบทั้งอันดับและรายได้โฆษณาพร้อมกัน

ทางเลือกที่พิจารณาแล้วไม่เอา: HTML ล้วน (ต้อง copy shell ทุกหน้า พังตอนหน้าที่ 10) · Next.js (หนักเกินสำหรับเว็บ static ~15 หน้า) · Eleventy (ใช้ได้ แต่ Astro จัดการ island ของเกมได้ดีกว่า)

### 🚫 ห้ามซื้อ — ไม่ต้องใช้ทั้งหมด

Azure Front Door / CDN (SWA กระจาย global อยู่แล้วตั้งแต่ Free) · App Service · Container Apps / AKS · ฐานข้อมูลใดๆ (ไม่มี backend) · Application Insights เกิน free tier

### ต้นทุนจริงต่อปี

โดเมน ~$12-15 · hosting $0 (เฟส 1) → ประมาณ $110/ปีถ้าอัป Standard ทั้งปี

**รวมแล้วประมาณ 0.2–2% ของงบ 6,000**

### บทเรียนที่ยกมาจาก The Admin Desk (`/Users/waris.c/claude/admin-tools-dev`)

โปรเจกต์นั้นคือเว็บรวมเครื่องมือไทย client-side 23 ตัว ซึ่งเป็น **รูปทรงสินค้าเดียวกันกับ watduang** — เจ้าของเว็บเคยสร้างแพตเทิร์นนี้มาแล้วครั้งหนึ่ง เอาบทเรียนมาใช้ ไม่ต้องเรียนซ้ำ

**🔴 บทเรียนที่แพงที่สุด — เขียนไว้ในรีโปนั้นเองว่าเป็นความผิดพลาด**

> *"hash routes (`#/tool/x`) are invisible to crawlers as separate pages. For real indexing, Phase 2 should switch to path routing (`/tools/pdf-merge`) with prerendering"*

Admin Desk ใช้ hash routing แล้วต้องมาแก้เป็น path routing ทีหลัง · **watduang ต้องเป็น path routing ตั้งแต่บรรทัดแรก** ห้ามมี `#/` เด็ดขาด เพราะ SEO ไม่ใช่ฟีเจอร์ของเว็บนี้ มันคือโมเดลธุรกิจทั้งก้อน — ข้อนี้คือเหตุผลที่เลือก Astro ไม่ใช่ SPA

**✅ แพตเทิร์นที่ยกมาใช้ได้เลย**

1. **สถาปัตยกรรมปลั๊กอิน: "เพิ่มเครื่องมือ = 1 ไฟล์ใหม่ + 1 บรรทัดใน manifest"** — ตรงกับ watduang ที่จะโตเป็น 15+ เกม และ `register()` ของเขา validate แล้ว `console.warn` แทนที่จะ crash **เกมที่พังไฟล์เดียวห้ามลากเว็บทั้งเว็บลงไป**
2. **schema `seo: { title, steps[] }`** → เรนเดอร์เป็นทั้ง section "วิธีใช้" ที่คนเห็น และ HowTo JSON-LD พร้อมกัน · watduang ใช้ท่าเดียวกันกับ "วิธีเล่น" ต่อเกม + `ItemList` บนหน้าหมวด
3. **`crypto.getRandomValues` และบอกในหน้าเว็บว่าใช้** สำหรับเครื่องมือที่ความยุติธรรมสำคัญ — สำคัญมากกับเกม "ใครแพ้" เพราะคนเล่นแข่งกันจริง ถ้าสงสัยว่าโกงคือเกมจบ
4. **`staticwebapp.config.json` ไฟล์เดียวใช้ทั้ง local และ Azure** พร้อม `navigationFallback` + `globalHeaders` (CSP, X-Content-Type-Options) — โครงพร้อมใช้
5. **บั๊กที่แก้แล้ว: wheel spinner มี `setTimeout` failsafe เพราะ rAF ค้างเมื่อแท็บถูกซ่อน** — ต้องยกมาด้วย ไม่ใช่ค้นพบใหม่

**🔴 กับดักที่ต้องแก้ก่อนใช้ — CSP ของเขาจะบล็อก AdSense**

`staticwebapp.config.json` ของ Admin Desk ตั้ง CSP ไว้ว่า:
```
default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'
```
Admin Desk ตั้งใจให้แน่นแบบนี้เพราะจุดขายคือ PDPA/ไม่ส่งข้อมูลออก — **แต่ watduang หากินด้วย AdSense** ถ้า copy CSP นี้มาตรงๆ **โฆษณาจะไม่ขึ้นเลยและจะดีบักยากมาก** เพราะมันเงียบ ต้องเปิดให้ `googlesyndication` / `doubleclick` / `google-analytics` ก่อน

**สรุปความสัมพันธ์:** ยืมเฟรมเวิร์กและบทเรียน ไม่ยืมจุดยืนเรื่อง privacy — สองเว็บนี้หากินคนละทาง

---

## โครงสร้างที่จะใช้จริง — หลายเกมในเว็บเดียว

### กลไกแกนกลาง: manifest → getStaticPaths → 1 เกม 1 ไฟล์ HTML

นี่คือจุดที่แปลแพตเทิร์นของ Admin Desk ให้ถูกต้องเรื่อง SEO — เขาได้ "เพิ่มเครื่องมือ = 1 ไฟล์ + 1 บรรทัด" แต่ออกมาเป็น hash route ที่ Google มองไม่เห็น · ของเรา manifest ตัวเดียวกันถูกอ่านตอน build แล้วปั๊มเป็น HTML จริงหน้าละเกม

```
manifest.ts  ──build──▶  getStaticPaths()  ──▶  /game/wheel/index.html
   (รายชื่อเกม)                                  /game/pick-loser/index.html
                                                 /game/truth-dare/index.html
```

เพิ่มเกมใหม่ = เขียน `src/games/<id>.ts` + เติม 1 บรรทัดใน manifest → ได้หน้า index ได้เองอัตโนมัติ ไม่ต้องแตะ core ไม่ต้องแตะ routing

### โครงไดเรกทอรี

```
watduang/
├─ staticwebapp.config.json     ← ไฟล์เดียว ใช้ทั้ง local (swa CLI) และ Azure
├─ .github/workflows/azure-swa.yml
├─ src/
│  ├─ games/
│  │  ├─ _template.ts           ← คัดลอกไฟล์นี้เพื่อสร้างเกมใหม่
│  │  ├─ manifest.ts            ← รายชื่อเกม + lazy libs  (แหล่งความจริงเดียว)
│  │  ├─ wheel.ts
│  │  ├─ pick-loser.ts
│  │  └─ …
│  ├─ shell/                    ← ผลลัพธ์จาก #06 ทุกเกมใช้ร่วมกัน
│  │  ├─ PlayerSetup.astro      ← ตั้งผู้เล่น 2-10 คน + จำรายชื่อ
│  │  ├─ PassPhone.astro        ← จังหวะส่งมือถือ
│  │  └─ Forfeit.astro          ← บทลงโทษเป็นกลาง
│  ├─ layouts/GameLayout.astro  ← SEO + JSON-LD + ช่องโฆษณา
│  └─ pages/
│     ├─ index.astro
│     ├─ game/[id].astro        ← getStaticPaths() อ่านจาก manifest
│     └─ c/[category].astro     ← หน้าหมวด (รอ #10 ว่ามีหมวดอะไรบ้าง)
└─ public/
```

### แต่ละชั้นรับผิดชอบอะไร — ห้ามข้ามเส้น

| ชั้น | ถือ | ห้ามถือ |
|---|---|---|
| `manifest.ts` | รายชื่อเกม ลำดับ หมวด lazy libs | ตรรกะเกม |
| `games/<id>.ts` | กติกาเกมนั้น + metadata ของตัวเอง (`seo`, `players`, `keywords`) | SEO tag, ช่องโฆษณา, การตั้งผู้เล่น |
| `shell/*` | ตั้งผู้เล่น · ส่งมือถือ · บทลงโทษ | อะไรที่เฉพาะเกมใดเกมหนึ่ง |
| `GameLayout` | `<title>` meta OG JSON-LD ช่องโฆษณา วิธีเล่น | กติกาเกม |

**เกมไม่รู้จัก SEO และไม่รู้จักโฆษณา** มันแค่ประกาศ `seo: {title, steps[]}` แล้ว layout เอาไปเรนเดอร์เป็นทั้ง section "วิธีเล่น" ที่คนอ่าน และ `HowTo` JSON-LD ที่ Google อ่าน — ท่าเดียวกับ Admin Desk เป๊ะ

### schema ของไฟล์เกม (ยกจาก tool schema ของ Admin Desk)

```ts
export default {
  id: 'pick-loser',                       // → /game/pick-loser
  names: { th: 'สุ่มคนโดน', en: 'Pick the Loser' },
  category: 'random',
  players: [2, 10],
  keywords: ['สุ่มคนโดน', 'เกมลงโทษ'],
  needs: [],                              // lazy libs จาก manifest
  seo: { title: '…', steps: ['…','…'] },  // → วิธีเล่น + HowTo JSON-LD
  ads: true,                              // ← false สำหรับหน้าที่ #09 กันไว้
  render(stage, H) { /* ตรรกะเกม */ },
}
```

`ads: false` คือจุดที่ [#09](09-alcohol-in-metadata.md) เชื่อมเข้าสถาปัตยกรรม — หน้าไหนตั้ง `false`, `GameLayout` ไม่ปล่อยช่องโฆษณาและใส่ Auto ads page exclusion ให้ **ไม่ต้องมีใครจำเอง**

**ต้อง `register()` แบบ validate แล้ว `console.warn` ไม่ใช่ throw** ตามที่ Admin Desk ทำ — เกมพังไฟล์เดียวห้ามลากเว็บทั้งเว็บลง

### วิธีพัฒนาบน Azure — local-first, ขึ้น prod เป็นแค่ config

แนวทางที่ Admin Desk ตัดสินไว้แล้วและใช้ได้เลย เพราะ watduang ไม่มี backend ยิ่งง่ายกว่า:

1. `staticwebapp.config.json` **ไฟล์เดียว** ใช้ทั้ง local และ Azure — ไม่มีไฟล์ config แยกตาม environment
2. รัน local ผ่าน **SWA CLI** (`swa start`) ให้เหมือน production จริง ไม่ใช่ `vite dev` เปล่าๆ ที่ routing ไม่เหมือนกัน
3. **path ทุกอย่างเป็น relative** ไม่มี base URL ตาม env — นี่คือสิ่งที่ทำให้การขึ้น prod เป็นแค่ config ไม่ใช่การรื้อ
4. deploy ด้วย GitHub Actions ที่ SWA สร้างให้ตอน connect repo
5. `navigationFallback` + `globalHeaders` ยกโครงจาก Admin Desk มา **แต่แก้ CSP ให้ผ่าน AdSense ก่อน**

---

## ข้อกำหนด: ไม่ vendor lock-in (เจ้าของเว็บสั่ง 2026-08-13)

> *"design container และ serverless รองรับการย้ายไป run ที่ cloud อื่น"*

**เป้าหมายรับ ข้อเสนอไม่รับ** — container ทำให้เว็บนี้ *ผูก* มากขึ้น ไม่ใช่น้อยลง

### ทำไม container ทำให้แย่ลงสำหรับเว็บนี้โดยเฉพาะ

Build ของเราคือ **โฟลเดอร์ไฟล์ static ล้วน** ซึ่งเป็น artifact ที่พกพาได้ที่สุดที่มี — รันได้บน Azure SWA · Cloudflare Pages · Netlify · Vercel · S3+CloudFront · GitHub Pages · nginx เครื่องไหนก็ได้ ย้ายคลาวด์ = ชี้ DNS ใหม่ + build ใหม่

ห่อมันด้วย container แล้วได้อะไรเพิ่ม: registry · image · runtime · scaling config · health check · liveness probe — **ทั้งหมดนี้คือของที่ต้องพอร์ตตามไปด้วยตอนย้าย** ไฟล์ static ไม่มีอะไรพวกนี้เลย

และเสียของจริงสองอย่าง:
- **เสียการกระจาย global** SWA ให้ globally distributed static content ตั้งแต่ Free (CONFIRMED จาก Microsoft Learn) · container รันภูมิภาคเดียว จะได้ global ต้องจ่ายเพิ่มและตั้งค่าเอง
- **cold start ถ้า scale-to-zero** — กินตรง LCP ซึ่งกระทบทั้งอันดับ Google และรายได้โฆษณา คือกระทบโมเดลธุรกิจตรงๆ

### รับประกันการพกพาด้วยวิธีที่แข็งกว่า — invariant ที่ทดสอบได้

> **Build ต้องออกมาเป็น `dist/` ที่เป็นไฟล์ static ล้วน และของที่ผูกกับ Azure ต้องอยู่ในไฟล์ 2 ไฟล์เท่านั้น**

ทดสอบข้อนี้ได้จริงด้วยคำสั่งเดียว — ถ้า `npx serve dist/` เสิร์ฟเว็บได้ครบทุกหน้า แปลว่าพกพาได้ **ใส่เป็น CI step ได้เลย จะได้ไม่มีใครเผลอทำหลุด**

| จุดที่ผูกกับ Azure | ทางออกที่เทียบเท่าบนคลาวด์อื่น | ต้นทุนพอร์ต |
|---|---|---|
| `staticwebapp.config.json` (~50 บรรทัด: routes, navigationFallback, globalHeaders) | `_redirects` + `_headers` (Netlify/Cloudflare) · `vercel.json` · nginx conf | ~1 ชั่วโมง |
| deploy step ใน GitHub Actions (`Azure/static-web-apps-deploy`) | เปลี่ยน action ตัวเดียว — step `npm run build` เป็นกลางอยู่แล้ว | ~5 บรรทัด |

**นั่นคือพื้นที่ lock-in ทั้งหมด** ไม่มีจุดที่สาม

### กฎถาวรที่ห้ามละเมิด — นี่คือที่ที่ lock-in จะแอบเข้ามาจริง

1. **ห้ามใช้ SWA auth (`/.auth/*`)** — ผูกกับ Azure AD ไม่มีของเทียบเท่า เว็บนี้ไม่มีล็อกอินอยู่แล้ว
2. **ห้ามใช้ Azure-specific binding ใน function ใดๆ** ถ้าวันหนึ่งมี backend (UGC, leaderboard) ต้องเป็น **HTTP handler ธรรมดา** และ adapter ของแพลตฟอร์มอยู่ชั้นนอกสุดชั้นเดียว — ย้ายไป Lambda/Workers/Cloud Run ได้โดยไม่แตะตรรกะ
3. **ห้ามมี SDK ของ Azure ใน build** — ตอนนี้ไม่มี ห้ามให้มี
4. **path เป็น relative ทั้งหมด** ไม่มี base URL ตาม env (กฎเดิมจาก Admin Desk — มันทำหน้าที่ทั้งเรื่อง promotion และเรื่อง portability พร้อมกัน)

### Container ใช้ตรงไหน — ใช้ตรงที่มันชนะจริง

**ใช้กับ build และ local dev · ไม่ใช้กับการเสิร์ฟ**

`Dockerfile` ที่รัน build ของ Astro ให้ผลลัพธ์เดียวกันทุกเครื่องทุก CI — นั่นคือความหมายของ "containerized" ที่มีค่าจริง และตรงกับที่ Admin Desk ทำอยู่แล้ว (`docker-compose.yml` สำหรับ local)

การเสิร์ฟยังเป็นไฟล์ static บน CDN เพราะไฟล์ static พกพาได้มากกว่า container อยู่แล้ว

### Serverless

**ตอนนี้ไม่มีและไม่ต้องมี** — เว็บไม่มี backend เลย ทุกอย่างรันในเบราว์เซอร์ · ถ้าวันหนึ่งต้องมี ให้ทำตามกฎข้อ 2 ข้างบน · การใส่ serverless ไว้ก่อนทั้งที่ยังไม่มีอะไรให้มันทำ คือการเพิ่มพื้นผิว lock-in โดยไม่ได้อะไรกลับมา

### เส้นที่ยังลากไม่ได้จนกว่า #10 จะปิด

`c/[category].astro` — มีหมวดอะไรบ้าง และหน้าแรกโชว์อะไรก่อน · โครงข้างบนรองรับได้ทุกคำตอบ ไม่ต้องรื้อ

### ที่ยังต้องรอ #10

โครง URL และหน้าหมวดมีอะไรบ้าง — Astro รองรับได้ทุกแบบ ตัดสิน stack ไปก่อนได้อย่างปลอดภัย

## Answer (ครึ่ง URL structure)

[#10](10-front-door-strategy.md) ปิดแล้ว → มีสองชนิดของหน้า: **เกม** (ตัวตน) กับ **เครื่องมือสุ่ม** (เนื้อเยื่อเชื่อม)

```
/                    หน้าแรก — เกมนำ เครื่องมืออยู่รอง
/game/<slug>         1 เกม = 1 URL
/games/              หมวดเกมทั้งหมด
/tool/<slug>         1 เครื่องมือ = 1 URL  (wheel · draw · team · number)
/tools/              หมวดเครื่องมือทั้งหมด
/en/…                กระจกภาษาอังกฤษ (ทีหลัง — PartyPick)
```

**แยก `/game/` กับ `/tool/` ไม่ยุบรวม** — คนละเจตนาการค้นหา และได้ hub สองอันเป็นเป้าคีย์เวิร์ดสองก้อนแทนที่จะเป็นก้อนเดียว

**slug เป็น latin ไม่ใช่ไทย** — URL ไทยถูก percent-encode จนแชร์แล้วอ่านไม่ออกและพังง่ายเวลา copy · คีย์เวิร์ดไทยไปอยู่ที่ `<title>` H1 และ meta ซึ่งเป็นที่ที่มันมีน้ำหนักจริงอยู่แล้ว

**ไม่ซ้อนลึกกว่าสองชั้น** — ไม่มี `/games/party/drinking/xxx` เพราะเว็บ 20 หน้าไม่ต้องการลำดับชั้น และการซ้อนลึกทำให้ย้าย URL ยากตอนจัดหมวดใหม่

---

## ✅ Status: resolved ทั้งสองครึ่ง

stack + hosting + วิธีพัฒนาบน Azure + การรับประกัน portability + โครง URL ครบแล้ว
สิ่งที่ยังต้องตัดสินคือ *เกมอะไรบ้าง* ซึ่งเป็นของ [#04](04-game-catalog-v1.md) ไม่ใช่ใบนี้
