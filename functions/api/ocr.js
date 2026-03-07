/**
 * Cloudflare Pages Function: /api/ocr
 * Accepts multipart/form-data:
 *   - files: one or more File objects (images, or PDF pages rendered client-side as images)
 *   - invoiceType: "petty_cash" | "purchasing" (optional)
 *   - expectedCount: number (optional)
 *
 * For each file, converts to base64 and forwards to Cloud Run OCR JSON endpoint.
 */
const CLOUD_RUN_OCR_URL = "https://invoice-ocr-api-474038747552.asia-southeast1.run.app/ocr";

function json(res, status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
    },
  });
}

function b64FromArrayBuffer(buf) {
  // Workers supports btoa on strings only; convert Uint8Array -> binary string.
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000; // 32KB chunks to avoid call stack limits
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "access-control-max-age": "86400",
    },
  });
}

export async function onRequestPost({ request }) {
  try {
    const ct = request.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return json(null, 400, { error: "Expected multipart/form-data" });
    }

    const form = await request.formData();
    const files = form.getAll("files").filter(Boolean);
    if (!files.length) return json(null, 400, { error: "Missing files" });

    const mode = String(form.get("invoiceType") || "petty_cash");
    const expectedCount = form.get("expectedCount");
    const extra = expectedCount ? { expectedCount: String(expectedCount) } : {};

    const rows = [];
    for (const f of files) {
      // f can be a string if wrong field; ensure it's File
      if (!(f instanceof File)) continue;

      const ab = await f.arrayBuffer();
      const image_base64 = b64FromArrayBuffer(ab);

      const payload = {
        image_base64,
        mime_type: f.type || "image/jpeg",
        filename: f.name || "upload",
        mode,
        ...extra,
      };

      const r = await fetch(CLOUD_RUN_OCR_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await r.text();
      let data = null;
      try { data = JSON.parse(text); } catch { /* keep null */ }

      if (!r.ok) {
        return json(null, 502, {
          error: "Upstream OCR error",
          status: r.status,
          filename: f.name,
          upstream: data || text,
        });
      }

      const got = data?.rows;
      if (Array.isArray(got)) {
        for (const row of got) {
          rows.push({ filename: payload.filename, ...row });
        }
      } else {
        // allow single object
        rows.push({ filename: payload.filename, ...(data || {}) });
      }
    }

    return json(null, 200, { rows });
  } catch (err) {
    return json(null, 500, { error: err?.message || String(err) });
  }
}
