#!/usr/bin/env bash
# Portability smoke test: dist/ must serve standalone with `npx serve`, no Azure runtime.
# Extracted verbatim from .github/workflows/ci.yml's "Smoke test" step so `npm run ci` covers it
# too, not just the workflow file -- a green `npm run ci` used to not mean CI would pass.
# GitHub Actions runs `run:` steps with no `shell:` key under `bash -e {0}` -- errexit only, NO
# pipefail. Do not add pipefail here: the og:image extraction below is a pipe ending in `sed`,
# which always exits 0 even when the `grep` upstream of it finds nothing -- that's what lets the
# original inline step accumulate one ::error:: per bad page instead of aborting on the first one.
set -e

# SMOKE_PORT overrides the hardcoded CI port so this can run locally beside another dev server.
# Unset (the CI case) it defaults to the same 4321 the inline step always used.
PORT="${SMOKE_PORT:-4321}"

# A port already LISTENing before this script starts means some other process owns it -- this run
# would then curl THAT server and print a green summary for someone else's (possibly stale) dist/.
if (exec 3<>"/dev/tcp/localhost/${PORT}") 2>/dev/null; then
  exec 3>&- 3<&-
  echo "::error::Port ${PORT} is already in use before this script started -- refusing to smoke-test a foreign server. Set SMOKE_PORT to a free port."
  exit 1
fi

npx serve@14 dist/ -l "$PORT" &
SERVER_PID=$!
# Unconditional teardown: runs on every exit path (success, `exit 1` below, or a future -e abort)
# so a failure never leaves an orphaned `serve` holding the port for the next run to falsely pass
# against.
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

READY=0
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${PORT}/" > /dev/null; then
    READY=1
    break
  fi
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  echo "::error::Server did not become ready within timeout"
  exit 1
fi

status=0
# Every built game must be smoke-tested, not just the ones whose names we remembered when writing this file —
# the old list hardcoded /game/timebomb/, so game #2 onward never got hit at all.
GAME_PATHS=$(for d in dist/game/*/; do [ -d "$d" ] || continue; echo "/game/$(basename "$d")/"; done)
# Compares the number of pages built against the number of games in the manifest — "more than zero"
# alone can still stay green while one game is missing (manifest reverted but the game file still
# exists → validate passes, smoke passes, prod 404s).
BUILT=$(printf '%s\n' "$GAME_PATHS" | grep -c . || true)
EXPECTED=$(node --input-type=module -e "const {games} = await import('./src/games/manifest.ts'); console.log(games.length)")
if [ "$BUILT" -ne "$EXPECTED" ]; then
  echo "::error::Built $BUILT game page(s) but manifest declares $EXPECTED"
  exit 1
fi
# Compares dist/tool/*/ against the slug list declared right here (not derived from src/pages/tool/ —
# src is the source that generates it; if a tool page disappears, src disappears with it, so baseline
# and output would shrink together and pass silently).
EXPECTED_TOOL_SLUGS="wheel draw team number"
TOOL_PATHS=$(for d in dist/tool/*/; do [ -d "$d" ] || continue; echo "/tool/$(basename "$d")/"; done)
for slug in $EXPECTED_TOOL_SLUGS; do
  if [ ! -d "dist/tool/$slug" ]; then
    echo "::error::Expected tool page 'dist/tool/${slug}/' not found in build output"
    exit 1
  fi
done
echo "smoke: $BUILT game page(s) (matches manifest) + tool page(s) ($EXPECTED_TOOL_SLUGS) + core pages"
# /games/ was in this list until ADR-0041 deleted that page. Its 301 lives in
# staticwebapp.config.json, which `npx serve` does not read — this step exists precisely to
# prove dist/ stands up with no Azure runtime, so a path that only resolves through Azure
# routing can never belong here. The two category pages that took over its job are listed
# instead: they were not smoke-tested before, which is why deleting one page could break
# this step at all.
for path in "/" "/c/fortune/" "/c/party/" "/tools/" $GAME_PATHS $TOOL_PATHS; do
  body=$(curl -sf "http://localhost:${PORT}${path}") || { echo "::error::curl failed for ${path}"; status=1; continue; }
  if ! echo "$body" | grep -qi '<title>'; then
    echo "::error::No <title> tag found for ${path}"
    status=1
  fi
  # og:image must exist and must actually load — a meta tag pointing at a file that isn't there
  # is a blank link when shared, which fails completely silently with nothing visibly broken on the site.
  og=$(echo "$body" | grep -o 'property="og:image" content="[^"]*"' | head -1 | sed 's/.*content="//; s/"$//')
  if [ -z "$og" ]; then
    echo "::error::No og:image for ${path}"
    status=1
  else
    # https* not https\? — \? is a GNU extension that doesn't test on mac; this one is pure POSIX
    og_path=$(echo "$og" | sed 's|^https*://[^/]*||')
    if ! curl -sf -o /dev/null "http://localhost:${PORT}${og_path}"; then
      echo "::error::og:image does not resolve for ${path} -> ${og}"
      status=1
    fi
  fi
done

exit $status
