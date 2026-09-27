import "server-only";
import { openai, AI_MODEL, isBudgetExceeded, logUsage } from "@/lib/ai";
import { CATEGORIES } from "@/lib/types";

export const VISION_SYSTEM_PROMPT = `You analyze photographs submitted by citizens reporting municipal infrastructure problems in
Gjakova, Kosovo. Describe only what is visibly present in the image.

Rules:
- List concrete visible objects and conditions. Do not infer causes, history, or blame.
- If the image is too dark, blurry, or unrelated to municipal infrastructure, say so in
  visual_summary and set confidence below 0.3.
- Never identify people, faces, license plates, or house numbers. If people are visible,
  ignore them entirely and do not mention them.
- severity reflects visible physical risk to the public only. 'high' = immediate hazard
  (open manhole, collapsed surface, exposed wiring, sewage in a public space). 'medium' =
  degradation needing repair. 'low' = cosmetic or minor.
- suggested_department must be exactly one of the municipal department names supplied in the
  user message. Never invent a department name.
- visual_summary is one factual sentence, maximum 25 words, no judgment adjectives.
- confidence is 0.0-1.0 reflecting how clearly the image supports your reading.
- Write visual_summary, condition and objects in Albanian.

Return only the JSON object matching the schema. No commentary.`;

const DEPARTMENT_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];

// The real 13 departments, handed to the model in the user message so
// suggested_department comes from this list rather than an invented category.
// The json_schema enum below pins it to the same ids.
const DEPARTMENT_LIST = CATEGORIES.map(
  (c) => `- ${c.id} (${c.label}): ${c.scope}`
).join("\n");

export type VisionAnalysis = {
  objects: string[];
  condition: string;
  severity: "low" | "medium" | "high";
  suggested_department: string;
  visual_summary: string;
  confidence: number;
};

// The image is fetched by the model provider, not by us, so a dead or
// non-image URL would surface as an opaque API error. A cheap preflight turns
// that into a clear skip reason before any tokens are spent.
const PREFLIGHT_TIMEOUT_MS = 5000;

async function imageIsReachable(photoUrl: string): Promise<boolean> {
  try {
    const res = await fetch(photoUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`analyzePhoto: image not reachable — HTTP ${res.status}`);
      return false;
    }
    const type = res.headers.get("content-type");
    if (type && !type.startsWith("image/")) {
      console.warn(`analyzePhoto: URL is not an image — content-type ${type}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("analyzePhoto: image preflight failed", err);
    return false;
  }
}

/**
 * Describes what is visible in a report's photo, and which department the
 * image alone points to. The report-photos bucket is public-read, so the
 * public URL goes straight to the model.
 *
 * Never throws: a null photo URL, an unreachable image, or any API failure
 * logs a warning and returns null. Vision is an enrichment step — it must
 * never block a citizen's submission.
 */
export async function analyzePhoto(photoUrl: string | null | undefined): Promise<VisionAnalysis | null> {
  if (!photoUrl) return null;
  if (!process.env.AI_API_KEY) {
    console.warn("analyzePhoto: AI_API_KEY is not set — skipping vision");
    return null;
  }

  if (!(await imageIsReachable(photoUrl))) return null;

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: VISION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Municipal departments — suggested_department must be exactly one of these ids:\n" +
                DEPARTMENT_LIST +
                "\n\nAnalyze the attached photograph.",
            },
            { type: "image_url", image_url: { url: photoUrl } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "photo_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              objects: { type: "array", items: { type: "string" } },
              condition: { type: "string" },
              severity: { type: "string", enum: ["low", "medium", "high"] },
              suggested_department: { type: "string", enum: DEPARTMENT_IDS },
              visual_summary: { type: "string" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
            required: [
              "objects",
              "condition",
              "severity",
              "suggested_department",
              "visual_summary",
              "confidence",
            ],
            additionalProperties: false,
          },
        },
      },
    });
  } catch (err) {
    if (isBudgetExceeded(err)) {
      // Swallowed rather than rethrown as AIBudgetExceededError: classification
      // runs next and will surface the budget failure to the route's handler.
      console.warn("analyzePhoto: AI budget exhausted — continuing without vision");
      return null;
    }
    console.warn("analyzePhoto: vision call failed — continuing without vision", err);
    return null;
  }

  logUsage("analyzePhoto", completion.usage);

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    console.warn("analyzePhoto: empty response — continuing without vision");
    return null;
  }

  try {
    return JSON.parse(raw) as VisionAnalysis;
  } catch (err) {
    console.warn("analyzePhoto: response was not valid JSON — continuing without vision", err);
    return null;
  }
}
