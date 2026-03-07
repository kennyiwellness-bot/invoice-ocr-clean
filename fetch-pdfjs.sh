#!/usr/bin/env bash
set -euo pipefail

# Download PDF.js ESM build (v4+) and store it in ./pdfjs/
# Run from your project root (where index.html exists).
# After download, pdfjs/pdf.min.mjs should be ~300KB+ and pdfjs/pdf.worker.min.mjs ~900KB+.

VERSION="${1:-4.10.38}"
mkdir -p pdfjs

echo "Downloading PDF.js ESM build v$VERSION ..."

curl -L "https://unpkg.com/pdfjs-dist@${VERSION}/build/pdf.min.mjs" -o "pdfjs/pdf.min.mjs"
curl -L "https://unpkg.com/pdfjs-dist@${VERSION}/build/pdf.worker.min.mjs" -o "pdfjs/pdf.worker.min.mjs"

echo "Done."
echo "Files written:"
ls -lh pdfjs/pdf.min.mjs pdfjs/pdf.worker.min.mjs

# Basic sanity check (avoid 404 HTML)
if grep -qi "<html" pdfjs/pdf.min.mjs; then
  echo "ERROR: pdf.min.mjs looks like HTML (download failed)."
  exit 1
fi
