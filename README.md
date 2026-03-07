# Invoice OCR (V16 UI) — Cloudflare Pages + Replicate deepseek-ocr

## 1) Upload this zip to Cloudflare Pages
Cloudflare Dashboard → Workers & Pages → **invoice-ocr** → Create deployment → Upload assets (zip)

## 2) Set Environment Variables (Secrets)
Workers & Pages → invoice-ocr → **Settings** → **Variables and Secrets** → Add

Required:
- `REPLICATE_API_TOKEN` = your Replicate token (starts with `r8_`)

Optional:
- `REPLICATE_MODEL_VERSION` = `lucataco/deepseek-ocr:<version_hash>`
  - default is already set to the version used in Replicate’s example
- `REPLICATE_TASK_TYPE` = `Free OCR` (default)

⚠️ IMPORTANT: add variables to **Production** (and Preview if you use preview deployments).

## 3) Test
Open: https://invoice-ocr.pages.dev
Upload PNG/JPG (image) and click **開始抽取 (API)**.

Notes:
- This demo currently supports **image files only** (PNG/JPG). If you upload PDF, it will show an error.
- The API returns `{ rows: [...] }` for the table. The parsing is heuristic (best effort).
