# gh#295 B rows: canvas boards, rendered and approved (2026-11-07)

Three boards in `design/` cover gh#295 rows B1, B2, B4 and B5. B3 and B6 went straight to code, because an approved board already holds their values. The fork review chose this split.

| Board | Rows | Owner's choice (popup 2026-11-07) |
|---|---|---|
| `design/Gh295Siamsi.dc.html` | B2 vessel, B5 keep-slip | Vessel **A**, a red lacquer tube at today's width. Keep-slip **A**: the slip stays, and the keep and tie buttons give way to DONE_KEEP and BTN_AGAIN. |
| `design/Gh295Home.dc.html` | B4 | Shelf **B**: drop the four duplicates, 14 tiles down to 10. The h1 is **kept**, which is the 2026-11-04 ruled text. |
| `design/Gh295Privacy.dc.html` | B1 | Placement **A**: a link in the home feedback band and one at the end of the feedback page's privacy line. The footer stays brand-only (the gh#247 ruling). The draft is **approved**. Controller: ผู้พัฒนาวัดดวง. Contact: the feedback page only. Date: the deploy day. |

The approved policy text is `privacy-approved-th.txt`. `src/pages/privacy.test.mjs` reads it, so it must stay tracked. The agent's draft is `privacy-draft-th.txt`, and the approved text differs from it only in the three filled slots.

## How the renders were made

The method is the gh#288 one. Each board was captured in headless Chrome from `file://` after `document.fonts.ready`, at a page width of 1600. The captures were cut into slices of 2000px or less and saved as JPEG quality 62. Every slice was viewed, and `innerText` holds no U+25CC. Each board used its own CDP port and browser profile.

- The TODAY siamsi frames are crops of a capture of the built `dist/`, kept in `siamsi-today/`.
- The home offsets were measured on the built page, n=3 per width (`home-offsets.json`).
- The owner saw the unstamped slices. The boards in `design/` carry the PICKED and NOT PICKED stamps, and nothing was deleted from them.

## Not covered

- No real phones, Safari or Firefox.
- No live AdSense: there is no publisher ID yet (gh#29).
- The privacy draft is not legal advice. Its legal basis and cross-border transfer are not stated.
- The B6 desktop two-column layout was split off to gh#296.
