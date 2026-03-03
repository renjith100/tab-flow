#!/usr/bin/env bash
set -euo pipefail

# ── TabFlow — Chrome Web Store packaging script ───────────────────────────────
# Produces dist/tabflow-<version>.zip containing only the files Chrome needs.
# Excludes documentation, dev tooling, .git, and icons/generate.html.
#
# Usage:  ./package.sh
# Output: dist/tabflow-<version>.zip

DIST_DIR="dist"
VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
OUT="$DIST_DIR/tabflow-${VERSION}.zip"

# Files Chrome actually needs — everything else stays out of the zip
FILES=(
  manifest.json
  background.js
  newtab.html
  newtab.css
  newtab.js
  models.js
  icons/icon16.png
  icons/icon48.png
  icons/icon128.png
)

echo "TabFlow packager — v${VERSION}"
echo ""

# Preflight: verify every required file is present before touching dist/
MISSING=0
for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "  missing: $f"
    MISSING=$((MISSING + 1))
  fi
done

if [[ $MISSING -gt 0 ]]; then
  echo ""
  echo "Aborting — $MISSING file(s) missing."
  echo "Tip: if icons are missing, open icons/generate.html in a browser first."
  exit 1
fi

# Build
mkdir -p "$DIST_DIR"
rm -f "$OUT"
zip -q "$OUT" "${FILES[@]}"

SIZE=$(du -sh "$OUT" | cut -f1)
echo "Output:  $OUT  ($SIZE)"
echo ""
echo "Included:"
for f in "${FILES[@]}"; do
  printf "  %s\n" "$f"
done
echo ""
echo "Upload at: https://chrome.google.com/webstore/devconsole"
