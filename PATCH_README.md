# Patch v3 (PDF.js fix + Smart split)

## 1) Fix PDF.js
Your current `pdfjs/pdf.min.js` and `pdfjs/pdf.worker.min.js` are actually "404 Not Found" HTML files.
Run this from the project root:

```bash
bash fetch-pdfjs.sh
```

Then redeploy.

## 2) Smart split (multi receipts in one photo)
- Deploy `functions/api/detect.js`
- Update frontend to:
  1) call `/api/detect` to get receipt boxes
  2) crop each box to an image
  3) send cropped images to `/api/ocr`


## v4 PDF.js note
This version uses ESM (.mjs) PDF.js build. Run `bash fetch-pdfjs.sh` then redeploy.
