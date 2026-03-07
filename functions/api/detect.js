// functions/api/detect.js
export const config = { runtime: "edge" };

const MODEL_PRED_URL =
  "https://api.replicate.com/v1/models/openai/gpt-5-mini/predictions";

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function pollPrediction(getUrl, headers, maxMs = 60000) {
  const started = Date.now();
  while (true) {
    const res = await fetch(getUrl, { headers });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { ok: false, error: data?.detail || data?.error || "Replicate poll failed", data };
    }

    if (data.status === "succeeded" || data.status === "failed" || data.status === "canceled") {
      return { ok: data.status === "succeeded", data };
    }

    if (Date.now() - started > maxMs) {
      return { ok: false, error: "Replicate timeout (poll exceeded)", data };
    }

    await sleep(900);
  }
}

function coerceOutputToText(output) {
  if (output == null) return "";
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.join("");
  if (typeof output === "object") return JSON.stringify(output);
  return String(output);
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try { return JSON.parse(candidate); } catch { return null; }
      }
    }
  }
  return null;
}

function buildDetectPrompt(expectedCount) {
  return `
You are a document layout assistant.

Goal:
Detect and return bounding boxes for each individual receipt/invoice present in the image.
If there are multiple small receipts in one photo, return one box per receipt.

Output STRICT JSON only:
{
  "receipts": [
    { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0, "confidence": 0.0 }
  ]
}

Rules:
- Coordinates are normalized (0..1), relative to the full image.
- x,y are top-left corner.
- w,h are width/height.
- Do NOT overlap boxes if possible.
- If unsure, return fewer but accurate boxes.
- Target count: ${expectedCount || "unknown"} (best-effort).
- JSON only. No markdown, no explanation.
`;
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.REPLICATE_API_TOKEN) {
      return jsonResponse({ error: "Missing REPLICATE_API_TOKEN in Pages environment variables." }, 500);
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const expectedCount = Number(formData.get("expectedCount") || 0);

    if (!file || !file.type?.startsWith("image/")) {
      return jsonResponse({ error: "Please upload exactly one image as field 'file'." }, 400);
    }

    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const base64 = btoa(bin);

    const headers = {
      Authorization: `Token ${env.REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
    };

    const system_prompt = buildDetectPrompt(expectedCount);

    const createRes = await fetch(MODEL_PRED_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        input: {
          system_prompt,
          image_input: [`data:${file.type};base64,${base64}`],
          temperature: 0.1,
        },
      }),
    });

    const created = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      return jsonResponse(
        { error: "Replicate create prediction failed", detail: created?.detail || created?.error || created },
        502
      );
    }

    const getUrl = created?.urls?.get;
    if (!getUrl) return jsonResponse({ error: "Replicate response missing urls.get", raw: created }, 502);

    const polled = await pollPrediction(getUrl, headers, 60000);
    if (!polled.ok) return jsonResponse({ error: polled.error || "Prediction failed", raw: polled.data }, 502);

    const prediction = polled.data;
    const outText = coerceOutputToText(prediction.output);

    let parsed = null;
    try { parsed = JSON.parse(outText); } catch { parsed = extractFirstJsonObject(outText); }

    if (!parsed || !Array.isArray(parsed.receipts)) {
      return jsonResponse({ error: "Model did not return valid receipts[]", raw_output: outText }, 502);
    }

    // Basic sanitation: clamp and filter tiny boxes
    const receipts = parsed.receipts
      .map(r => ({
        x: Math.max(0, Math.min(1, Number(r.x))),
        y: Math.max(0, Math.min(1, Number(r.y))),
        w: Math.max(0, Math.min(1, Number(r.w))),
        h: Math.max(0, Math.min(1, Number(r.h))),
        confidence: Math.max(0, Math.min(1, Number(r.confidence ?? 0.5))),
      }))
      .filter(r => r.w * r.h > 0.01); // drop extremely tiny

    return jsonResponse({ receipts });
  } catch (err) {
    return jsonResponse({ error: err?.message || String(err) }, 500);
  }
}
