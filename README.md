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

Vision reads English plus Simplified/Traditional Chinese, Japanese and Korean by default. For other
languages set `SOMEDAY_OCR_LANGS` (e.g. `SOMEDAY_OCR_LANGS=en-US,th-TH npm start`). After changing OCR
settings, use **Re-run OCR** on affected items. User edits are kept.

To see what OCR produces for one image (and which engine ran): `npm run ocr -- path/to/image.png`.
The detail view also shows "read with Apple Vision" or "read with Tesseract". Tesseract is Latin-only
and much worse on mixed-language screenshots; if you see it on a Mac, Vision failed to build.

## Status

Phase 1: import (button, multi-select, drag and drop), copy, display, duplicate detection, delete.

Phase 2: local OCR on import, stored text, search across OCR text and filename, Re-run OCR.

Phase 3: rule-based understanding (`app/extract.js`) fills in type, intent, name, location, why saved,
useful details and a confidence score. Everything is editable in the detail view; edited fields are kept
when an item is re-processed. Filter by intent with the chips under the search box.

Phase 4: **Home** shows what you've saved by intent (no backlog counts), a few varied things to rediscover
("Show me something else"; "Maybe later" hides one for 7 days) and what you saved recently.
**Review** is a short, optional pass of up to 5 things at a time: Keep, Maybe or Done (keys K, M, D).
Done things leave Home and discovery but stay in the Library and in search. Each detail view also has
Keep / Maybe / Done buttons. Selection logic is in `app/curate.js`.
