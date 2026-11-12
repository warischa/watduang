import sys
# Variants A/B/C are the REFUTE r1 reviewer's own; D, W1, W2 extend them to an echo and to the WebGL lane.
src, dst, variant = sys.argv[1], sys.argv[2], sys.argv[3]
t = open(src, encoding='utf8').read()
lane = "        run: npm run ci-probes\n"
webgl = "        run: bash scripts/webgl-pixels-lane.sh\n"
anchor = "      - name: Digest this job's own dist/ for the deploy check\n"
for s in (lane, webgl, anchor):
    assert t.count(s) == 1, s
def before_anchor(step):
    global t
    t = t.replace(anchor, step + anchor)
if variant in ('A', 'B', 'C', 'D', 'H1', 'H2', 'H3', 'H4', 'X'):
    t = t.replace(lane, "        run: PROBE_LANES=${{ matrix.lane }} npm run ci-probes\n")
if variant == 'B':
    before_anchor("      - name: Lane scripts parse\n        run: |\n          # the packed lane is npm run ci-probes; this step only lints a neighbour\n          bash -n scripts/smoke-dist.sh\n")
if variant == 'C':
    before_anchor("      - name: Lane scripts parse\n        run: bash -n scripts/ci-probes.sh\n")
if variant == 'D':
    before_anchor("      - name: Say what the lane is\n        run: echo npm run ci-probes\n")
# Round 2's counter-examples: a line that names the lane at command position but that shell never
# reaches, or reaches with its exit code discarded.
if variant == 'H1':
    before_anchor("      - name: Lane note\n        run: |\n          cat <<'NOTE'\n          npm run ci-probes\n          NOTE\n")
if variant == 'H2':
    before_anchor("      - name: Lane note\n        run: |\n          if false; then\n            npm run ci-probes\n          fi\n")
if variant == 'H3':
    before_anchor("      - name: Lane note\n        run: |\n          echo the lane is \\\n          npm run ci-probes\n")
if variant == 'H4':
    before_anchor("      - name: Lane note\n        run: npm run ci-probes || true\n")
if variant == 'X':
    before_anchor("      - name: Lane note\n        run: npm run ci-probes-x\n")
if variant in ('W1', 'W2'):
    t = t.replace(webgl, "        run: WEBGL_X=${{ matrix.lane }} bash scripts/webgl-pixels-lane.sh\n")
if variant == 'W2':
    before_anchor("      - name: Lane scripts parse\n        run: |\n          # scripts/webgl-pixels-lane.sh is the WebGL lane; this step only lints a neighbour\n          bash -n scripts/smoke-dist.sh\n")
open(dst, 'w', encoding='utf8').write(t)
