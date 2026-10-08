# Someday

A calm, local-first inbox for the screenshots you saved "for someday". See `PROJECT.md`.

## Run

Requires Node 20+. No dependencies to install.

    npm start        # http://localhost:3000

Images go to `images/`, metadata to `data/items.json` (both git-ignored). Originals are never touched.

## OCR

On macOS, install the Xcode command line tools (`xcode-select --install`). The first import compiles
`app/ocr/vision-ocr.swift` (Apple Vision) once, then reuses the binary. If Vision isn't available,
`tesseract` is used when installed. If neither exists, imports still succeed and items show
"OCR failed"; use **Re-run OCR** in the detail view once an engine is set up (this is also how to
scan screenshots imported earlier).

## Status

Phase 1: import (button, multi-select, drag and drop), copy, display, duplicate detection, delete.

Phase 2: local OCR on import, stored text, search across OCR text and filename, Re-run OCR.
