#!/usr/bin/env bash
# Is the live site byte-identical to a local build? Fetches every file under <dist-dir> from <origin>
# and compares bytes. Prints DIFF / MISS per file, then `same= diff= miss=`. Exit 0 only when every
# file matches; 1 on any diff or miss; 2 on bad usage or an empty build (an empty set must never read
# as a pass).
#
# usage: bash scripts/live-site-bytes.sh <dist-dir> <origin>
#   origin: the live address from docs/runbook.md, never the sitemap's (it does not resolve yet).
# Calibrate before trusting a pass: flip one byte in a COPY of the build and confirm it exits 1.
# staticwebapp.config.json is skipped: SWA consumes it and never serves it.
set -u
DIST=${1:-}; ORIGIN=${2:-}
if [ -z "$DIST" ] || [ -z "$ORIGIN" ] || [ ! -d "$DIST" ]; then
  echo "usage: bash scripts/live-site-bytes.sh <dist-dir> <origin>" >&2
  exit 2
fi
DIST=${DIST%/}; ORIGIN=${ORIGIN%/}
same=0; diff=0; miss=0
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
while IFS= read -r f; do
  rel=${f#"$DIST"/}
  url="$ORIGIN/$rel"
  case "$rel" in index.html) url="$ORIGIN/";; */index.html) url="$ORIGIN/${rel%index.html}";; esac
  code=$(curl -s -o "$TMP" -w '%{http_code}' --compressed "$url")
  if [ "$code" != "200" ]; then miss=$((miss+1)); echo "MISS $code $rel"; continue; fi
  if cmp -s "$TMP" "$f"; then same=$((same+1)); else diff=$((diff+1)); echo "DIFF $rel"; fi
done < <(find "$DIST" -type f ! -name staticwebapp.config.json | sort)
echo "same=$same diff=$diff miss=$miss"
if [ $((same + diff + miss)) -eq 0 ]; then
  echo "no files under $DIST -- nothing was compared" >&2
  exit 2
fi
[ "$diff" -eq 0 ] && [ "$miss" -eq 0 ]
