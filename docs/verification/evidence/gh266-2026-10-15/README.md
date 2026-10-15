> Committed copy (2026-10-15): the README and raw JSON are verbatim from the measuring run; of its PNGs only
> after2-A-320-hud.png after2-C-320-hud.png after2-C-320-result.png after2-C-390-hud.png after2-C-390-result.png before-A-320-hud.png before-A-320-result.png are kept here. Other PNG names cited below were not committed.

# gh#266 croc-bite name surfaces, before (integrate 224fc32) vs after (croc-names, uncommitted)
Path measured: NO-3D fallback board (headless --disable-gpu, in-page webgl2 = false), #croc-fallback-board teeth tapped via CDP touch. Viewports 320x568 and 390x844 via Emulation.setDeviceMetricsOverride (true reflow). Names typed into the shared player screen inputs (.ps-n), 6 rows.
Raw numbers: before-A.json before-B.json after-ABC.json. Screenshots: <tree>-<set>-<width>-{0players,hud,result}.png.
HUD card width (non-active card, px): BEFORE A 200.44 / B 162-170 ; AFTER A 149.44 / B 149.44 / C 149.44 (both widths). Active card +7.5 (AFTER) / +10 (BEFORE).
HUD strip scrollW/clientW: AFTER A 613/300 (320), 648/370 (390); C identical to A. BEFORE A 766/300, 801/370.
Document scrollWidth == viewport width in every run (no sideways page scroll).
#result-title (not touched by the fix, unclipped): overflows its container and viewport at 320 in BEFORE A (33.78 / 17.78 px) and AFTER A (same) and AFTER C 'abcdefghijklmnopAAAAAAAA' (27.67 / 11.67 px); fine at 390.
Score names: AFTER ellipsis-clip at 320 for every set (scrollW>clientW), full text in DOM; row never overflows board.
Toast/#turn-player-name: no overflow in any run (max toast 306.67 wide at 390 for 24xW, 0 px past viewport).

## Re-measure after rework (after2-*: card label <=16 chars as before else 15 + ellipsis, hidden full-name span, .result-title overflow-wrap:anywhere)
Same path (no-3D fallback), same sets. Raw: after2-ABC.json, check5-C.json; PNGs after2-<set>-<w>-*.png.
1 PASS: non-active card widths identical to BEFORE (A 200.44; B 161.95/163.13/164.39/166.67 at same names; active card +8..10 as before). Strip A 766/300, 801/370 = before.
2 PASS: no surface overflows container/viewport (cards, turn name, toast max 306.67 wide/0px past viewport, score rows); doc scrollW == viewport. Full names in DOM text of turn/toast/score rows; HUD card clips AAAA/BBBB to the same 'abcdefghijklmno...' but its hidden span carries the full name.
3 DIFFERS (benign): strip C 649/300 (320), 681/370 (390) vs A 766/801 - C labels are 15 chars + ellipsis so narrower; strip still scrolls inside its box, no page overflow.
4 PASS: #result-title at 320, A: 246px in 288 container, 0px over; C (24xW loser): wraps to 3 lines, 246px, 0px over container/viewport.
5 PASS: removing .card-name-full from every card changes widths by 0.00px (check5-C.json, both widths).
