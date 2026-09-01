import { env } from "./env";

/**
 * Model ids live here so they are trivial to bump without hunting through routes.
 * Override per-deployment with wrangler vars if you want a different tier.
 */
export const MODELS = {
  vision: "gemini-2.5-flash",
  research: "gemini-2.5-flash",
  image: "gemini-2.5-flash-image",
};

const API = "https://generativelanguage.googleapis.com/v1beta/models";

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

async function call(model: string, body: unknown) {
  const { GEMINI_API_KEY } = await env();
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set — add it to .dev.vars locally, or `wrangler secret put GEMINI_API_KEY`.");
  }
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Gemini ${model} failed (${res.status}): ${(await res.text()).slice(0, 400)}`);
  }
  return res.json() as Promise<any>;
}

function firstText(payload: any): string {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: any) => p?.text).filter(Boolean).join("\n").trim();
}

/** Pull a JSON object out of a model reply, tolerating ``` fences. */
function parseJson<T>(text: string, fallback: T): T {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]) as T; } catch { /* fall through */ } }
    return fallback;
  }
}

export type Enrichment = {
  tags: string[];
  style: string[];
  mood: string[];
  format: string;
  ocr: string;
};

const ENRICH_PROMPT = `You are cataloguing an image for a designer's private reference library.
Return ONLY JSON matching this shape:
{"tags":[],"style":[],"mood":[],"format":"","ocr":""}

tags   — 4-8 concrete nouns for what is depicted (materials, objects, setting).
style  — 3-6 descriptors a designer would say out loud ("board-formed concrete", "hard flash", "muted pastel", "Y2K").
mood   — 2-4 feeling words.
format — one of: photo, render, graphic, type, still, screenshot.
ocr    — any legible text in the image, else "".
Use British spelling. Lowercase everything except proper nouns.`;

export async function enrichImage(base64: string, mime: string): Promise<Enrichment> {
  const payload = await call(MODELS.vision, {
    contents: [{ role: "user", parts: [
      { text: ENRICH_PROMPT },
      { inline_data: { mime_type: mime, data: base64 } },
    ] as Part[] }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
  });
  const out = parseJson<Enrichment>(firstText(payload), {
    tags: [], style: [], mood: [], format: "photo", ocr: "",
  });
  return {
    tags: (out.tags ?? []).slice(0, 8),
    style: (out.style ?? []).slice(0, 6),
    mood: (out.mood ?? []).slice(0, 4),
    format: out.format || "photo",
    ocr: out.ocr ?? "",
  };
}

export type Identification = {
  title: string | null;
  maker: string | null;
  place: string | null;
  year: string | null;
  confidence: "high" | "medium" | "low" | "unidentified";
  sources: { label: string; url?: string }[];
  reasoning: string;
};

/**
 * Layer 2 + 3 of identification: the model's own knowledge, with Google Search
 * grounding for the ones it is unsure about. The caption (layer 1) is passed in
 * because Instagram credits the architect far more often than not.
 */
export async function identifyImage(
  base64: string,
  mime: string,
  context: { caption?: string | null; author?: string | null }
): Promise<Identification> {
  const prompt = `Identify this image if it is a published work (a building, interior, artwork, product, campaign or film still).

${context.caption ? `The post caption reads: """${context.caption}"""` : "No caption is available."}
${context.author ? `It was saved from the account @${context.author}.` : ""}

Prefer credits stated in the caption. Search the web to confirm or fill gaps.
Do NOT guess. If you cannot establish a fact, use null and set confidence to "unidentified" or "low".

Return ONLY JSON:
{"title":null,"maker":null,"place":null,"year":null,"confidence":"unidentified","sources":[{"label":"","url":""}],"reasoning":""}

confidence — "high" only when a caption credit and an independent source agree.
reasoning  — one sentence on how you concluded it, or what the style suggests if unidentified.`;

  const payload = await call(MODELS.research, {
    contents: [{ role: "user", parts: [
      { text: prompt },
      { inline_data: { mime_type: mime, data: base64 } },
    ] as Part[] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.1 },
  });

  const out = parseJson<Identification>(firstText(payload), {
    title: null, maker: null, place: null, year: null,
    confidence: "unidentified", sources: [], reasoning: "",
  });

  // fold in whatever the grounding metadata cited, so the footnotes are real links
  const chunks = payload?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const grounded = chunks
    .map((c: any) => c?.web)
    .filter(Boolean)
    .map((w: any) => ({ label: String(w.title ?? w.uri), url: String(w.uri) }));

  const seen = new Set<string>();
  const sources = [...(out.sources ?? []), ...grounded]
    .filter((s) => s && s.label && !seen.has(s.label) && seen.add(s.label))
    .slice(0, 4);

  return { ...out, sources };
}

export type BoardDNA = {
  narrative: string;
  materials: string[];
  title: string;
};

export async function writeBoardNarrative(input: {
  tags: string[]; style: string[]; mood: string[]; palette: string[]; client?: string | null;
}): Promise<BoardDNA> {
  const prompt = `You are a design director writing the short written direction that sits beside a mood board.

Style descriptors across the board: ${input.style.join(", ") || "—"}
Recurring subjects: ${input.tags.join(", ") || "—"}
Mood: ${input.mood.join(", ") || "—"}
Palette: ${input.palette.join(", ") || "—"}
${input.client ? `Client: ${input.client}` : ""}

Return ONLY JSON: {"title":"","narrative":"","materials":[]}
title     — a short phrase (max 8 words) naming the direction. No colon, no subtitle.
narrative — 45-70 words, specific and physical. Name materials, light and scale. No marketing adjectives, no "elevate", no "curated".
materials — 4-6 concrete materials or finishes.
Use British spelling.`;

  const payload = await call(MODELS.research, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.6, responseMimeType: "application/json" },
  });
  return parseJson<BoardDNA>(firstText(payload), { title: "Untitled direction", narrative: "", materials: [] });
}

/**
 * Concept generation. Gemini's image model accepts reference images alongside the
 * prompt, so the output inherits the board's actual visual language rather than a
 * generic reading of the words.
 */
export async function generateConcept(input: {
  slot: string;
  brief: string;
  narrative: string;
  palette: string[];
  references: { base64: string; mime: string }[];
}): Promise<{ base64: string; mime: string; prompt: string } | null> {
  const prompt = `Generate a single photographic concept image: ${input.slot}.

Project brief: ${input.brief}

Hold the visual language of the attached reference images — their palette (${input.palette.join(", ")}), light quality, materials and scale.
Direction: ${input.narrative}

No text, no logos, no watermarks. Photographic, not illustrative.`;

  const parts: Part[] = [{ text: prompt }];
  for (const r of input.references.slice(0, 4)) {
    parts.push({ inline_data: { mime_type: r.mime, data: r.base64 } });
  }

  const payload = await call(MODELS.image, {
    contents: [{ role: "user", parts }],
    generationConfig: { responseModalities: ["IMAGE"] },
  });

  const out = (payload?.candidates?.[0]?.content?.parts ?? [])
    .map((p: any) => p?.inlineData ?? p?.inline_data)
    .find((d: any) => d?.data);

  if (!out) return null;
  return { base64: out.data, mime: out.mimeType ?? out.mime_type ?? "image/png", prompt };
}
