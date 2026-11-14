# gh#310 rehearsal server

`rehearsal-server.mjs.txt` is one node process (Node >= 22, no dependency) that serves the built `dist/` and answers `/api/draw/*`.
It uses the real `routeDraw` / `handleDraw` from `services/feedback/src/join.mjs` over an in-memory store. No Azure, Azurite or download is needed.

## Run

```
cp docs/verification/evidence/gh310-rehearsal-2026-11-14/rehearsal-server.mjs.txt /tmp/rehearsal-server.mjs
node /tmp/rehearsal-server.mjs --repo <repo path>      # PORT=4795 by default, binds 0.0.0.0
```

The Mac browser and Safari in the iOS Simulator both reach it at `http://localhost:4795`. Every `/api/draw/*` request is logged as `ISO-time METHOD path -> status`, so a reveal with no API line shows that no call was made.
`dist/` must exist (build first).

## Mirrors

- `functions/join.mjs`: GET/POST only, path after `/api/draw/`, `X-Draw-Admin`, `Content-Length` pre-check and capped body read (`BODY_CAP`), and the `routeDraw` op decides the cap.
- Static: `index.html` for directory paths. Every `globalHeaders` entry of `public/staticwebapp.config.json` is sent (the production CSP). Its `mimeTypes` and 301 `routes` apply. A miss is a 404 with `404.html`.
- Store double: create-only without `ifMatch`, ETag-guarded replace and delete, ASCII-only metadata, `null` on a failed condition.

## Does not mirror

- Real Blob storage: latency, eventual consistency and the retry/lost-answer cases. Those are covered by `join-service.test.mjs` and the Azurite evidence.
- Retention timers: the 24h/72h expiry is evaluated per request against the clock, but nothing purges blobs. All data is lost on restart.
- SWA's `/api` proxy: it may rewrite headers and adds its own limits. No SWA auth, routing rules beyond the config's redirects, or compression.

## Run record (n=1, 2026-11-14, `curl` against localhost:4795, status + body)

```
HTTP/1.1 200 OK
Content-Security-Policy: default-src 'self'; script-src 'self' *.googlesyndication.com *.doubleclick.net *.goo
Content-Type: text/html; charset=utf-8
$ http://localhost:4795/game/prize-draw/join/
-> 200 <!DOCTYPE html>… (join page html)
$ -X POST http://localhost:4795/api/draw/events -d {}
-> 201 {"eventId":"xaehyp5O57UCPaAT7CkhKg","pin":"131372","adminToken":"<redacted>","expiresAt":"2026-11-17T10:34:12.311Z"}
event=xaehyp5O57UCPaAT7CkhKg pin=131372
$ -X POST http://localhost:4795/api/draw/events/xaehyp5O57UCPaAT7CkhKg/join -d {"pin":"131372","name":"สมชาย","token":"abcdefghijklmnop0123"}
-> 201 {"id":"Nhse_NfuzpjxfyppWC8nIg","name":"สมชาย","eventKey":"131372"}
$ -X POST http://localhost:4795/api/draw/events/xaehyp5O57UCPaAT7CkhKg/join -d {"pin":"000000","name":"x","token":"zzzzzzzzzzzzzzzz9999"}
-> 403 {"error":"pin"}
$ http://localhost:4795/api/draw/events/xaehyp5O57UCPaAT7CkhKg/names
-> 401 {"error":"admin"}
$ -H X-Draw-Admin: <redacted> http://localhost:4795/api/draw/events/xaehyp5O57UCPaAT7CkhKg/names
-> 200 {"state":"open","names":[{"id":"Nhse_NfuzpjxfyppWC8nIg","name":"สมชาย","joined":"2026-11-14T10:34:12.379Z"}]}
$ -X POST -H X-Draw-Admin: <redacted> http://localhost:4795/api/draw/events/xaehyp5O57UCPaAT7CkhKg/start -d {"ids":["Nhse_NfuzpjxfyppWC8nIg"]}
-> 200 {"roster":[{"id":"Nhse_NfuzpjxfyppWC8nIg","name":"สมชาย"}]}
$ http://localhost:4795/api/draw/events/xaehyp5O57UCPaAT7CkhKg/status/Nhse_NfuzpjxfyppWC8nIg
-> 200 {"state":"started","member":true}
$ -X POST http://localhost:4795/api/draw/events/xaehyp5O57UCPaAT7CkhKg/join -d {"pin":"131372","name":"late","token":"yyyyyyyyyyyyyyyy8888"}
-> 409 {"error":"started"}
```

Server log of the same run (every API call, nothing else):

```
2026-11-14T10:34:12.311Z POST /api/draw/events -> 201
2026-11-14T10:34:12.380Z POST /api/draw/events/xaehyp5O57UCPaAT7CkhKg/join -> 201
2026-11-14T10:34:12.407Z POST /api/draw/events/xaehyp5O57UCPaAT7CkhKg/join -> 403
2026-11-14T10:34:12.416Z GET /api/draw/events/xaehyp5O57UCPaAT7CkhKg/names -> 401
2026-11-14T10:34:12.425Z GET /api/draw/events/xaehyp5O57UCPaAT7CkhKg/names -> 200
2026-11-14T10:34:12.434Z POST /api/draw/events/xaehyp5O57UCPaAT7CkhKg/start -> 200
2026-11-14T10:34:12.442Z GET /api/draw/events/xaehyp5O57UCPaAT7CkhKg/status/Nhse_NfuzpjxfyppWC8nIg -> 200
2026-11-14T10:34:12.451Z POST /api/draw/events/xaehyp5O57UCPaAT7CkhKg/join -> 409
```

Admin token and PIN above belong to an in-memory event that ended with the process.

## QR-mode rehearsal, 2026-11-14 (iOS Simulator + the rehearsal server)

Owner order for gh#310 (2026-11-14): Simulator rehearsal → the deploy ask → real phones on the live site. This is the Simulator leg.

- Setup: the rehearsal server on port 4795 serving the build of the gh#309 working tree (after its round-1 fixes; the final draft-preserve fix touches only an in-flight status answer, which this run did not exercise). The setup page and the projector in the desktop app's browser pane (1024px wide, so every reveal ran in 3D). One phone: Safari in the iOS Simulator (iPhone 17e). The other 15 names joined through the real join route with `curl` (one device token each).
- Harness note: the browser pane opens `window.open` in the SAME tab, which killed the setup page before it created the event. A real laptop browser opens a window. For this run `window.open` on the setup page was stubbed (it records the call), and the projector was opened in its own tab. This is a harness shim, not a product change.
- Harness note 2: the Simulator's paste tool sent Thai as mojibake (UTF-8 read as MacRoman). The join page refused it with the approved name-rule message (`shots/phone-0-paste-mangled-refused.png`). The phone then joined as `Ton`.
- Event: 16 names, 3 prizes, schedule 16 → 8 → 7 → 6 → 5. Round 1 cards (ไพ่แจกทั้งห้อง), round 2 fireworks, rounds 3–4 the plain reveal, final the ladder (ทางแยกเลือกเส้น).

| Step | Projector | Phone (Ton) | Agree |
|---|---|---|---|
| Round 1 (cards) | deal code `0312 0505 5050`; Ton in the 8 kept | card `10 โพดำ`, the approved `แตะกติกาที่จอใหญ่เปิด`, tapped `ดำอยู่ต่อ` → `ผ่านรอบที่ 1` | yes |
| Round 2 (fireworks) | code `449 487 784`; history shows round 1 with its rule `ดำอยู่ต่อ`; Ton in the 7 | `ผ่านรอบที่ 2` | yes |
| Round 3 | code `454 047 960`; Ton in the 6 | `ผ่านรอบที่ 3` | yes |
| Round 4 | code `878 329 626`; Ton in the 5 | `ผ่านรอบที่ 4`, `ไปต่อรอบชิง รอรหัสรอบชิงบนจอใหญ่` | yes |
| Final (ladder, 3 prizes) | 7-digit final code `0148 531`; four earlier codes listed; result รางวัลที่ 1 Palm · 2 Ton · 3 Kla | `คุณได้รางวัล` · `รางวัลที่ 2` · `Ton` | yes |

- **No call at reveal time:** the server log (`rehearsal-run-server-log.txt`, admin header lines removed) has its last phone request at the status read right after the start (10:56:05). The phone then entered five codes and a rule tap (10:56–11:03) with 0 further requests, and the projector made none after the start either.
- Not covered here: real phones and the real Function App with Blob storage, which come after the deploy on the live site (owner order). A finalist placed past the prize count was not played on this phone; it is covered by `reveal-page.test.mjs` and the stubbed-API browser pass (`docs/verification/evidence/gh309-browser-2026-11-14/`: places 4–5 show `รอบชิง ไม่ผ่าน`).
