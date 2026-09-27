import "server-only";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CATEGORIES } from "@/lib/types";
import type { VisionAnalysis } from "@/lib/vision";

export const openai = new OpenAI({ apiKey: process.env.AI_API_KEY, baseURL: process.env.AI_BASE_URL });

// The one chat model every completion in this codebase uses. Confirmed
// available on the configured AI_BASE_URL proxy; gpt-4o-mini is not.
export const AI_MODEL = "gpt-5-mini";

export class AIBudgetExceededError extends Error {
  constructor(message = "AI proxy budget exceeded") {
    super(message);
    this.name = "AIBudgetExceededError";
  }
}

export function isBudgetExceeded(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = (err as { status?: number }).status;
  if (status !== 429) return false;
  const raw =
    (err as { error?: unknown }).error ?? (err as { message?: unknown }).message ?? err;
  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  return text.includes("budget_exceeded");
}

const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];
export type Category = (typeof CATEGORY_IDS)[number];
export type Urgency = "low" | "medium" | "high";

export type ClassificationResult = {
  category: Category;
  urgency: Urgency;
  confidence: number;
  // One Albanian sentence explaining the choice, shown to staff on the /admin
  // detail panel labeled as AI-generated. Stored in reports.reasoning.
  reasoning: string;
};

export type NewReportForDupCheck = {
  id: string;
  description: string;
  // The quality gate's restatement. Preferred over the raw description for the
  // embedding; null when the gate was unavailable for this report.
  normalizedDescription?: string | null;
  // Photo analysis, folded into the embedding so two reports about the same
  // thing match on what their photos show, not just on wording.
  visionAnalysis?: VisionAnalysis | null;
  latitude: number | null;
  longitude: number | null;
  area: string | null;
};

export type DuplicateMatch = {
  reportId: string;
  ticketCode: string;
  similarity: number;
};

// Duplicate detection scopes candidates by `area` first — it's a cleaner
// signal than raw distance since it matches how staff actually triage by
// neighborhood. Reports within this radius are only used as a fallback for
// candidates that predate the `area` column being populated.
const NEARBY_RADIUS_METERS = 250;
const DUPLICATE_SIMILARITY_THRESHOLD = 0.85;
const LOOKBACK_DAYS = 90;
export const MAX_DESCRIPTION_CHARS = 500;
// The duplicate-detection embedding covers the normalized description plus the
// photo's visual summary and object list, so it needs more room than a single
// description. Only the embedding input uses this; chat prompts stay at 500.
const MAX_EMBED_CHARS = 1500;

type OpenAIUsage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null | undefined;

export function logUsage(label: string, usage: OpenAIUsage) {
  if (!usage) return;
  console.log(
    `[ai] ${label} — prompt_tokens=${usage.prompt_tokens ?? "?"} completion_tokens=${usage.completion_tokens ?? "?"} total_tokens=${usage.total_tokens ?? "?"}`
  );
}

export const CLASSIFY_SYSTEM_PROMPT =
  "You classify municipal issue reports submitted by residents of Gjakova, Kosovo. " +
  "Descriptions are written in Albanian. Pick the single best-fitting category " +
  "(the municipal department responsible), estimate urgency for public safety/services, " +
  "and give your confidence in the category choice.\n\n" +
  "A photo analysis may accompany the description. When the photo and the written " +
  "description conflict, trust the photo and say so in reasoning. Never invent details " +
  "that are absent from both the description and the photo analysis.\n\n" +
  "reasoning is one sentence in Albanian, maximum 30 words, explaining why you chose this " +
  "department and urgency.\n\nCategories:\n" +
  CATEGORIES.map((c) => `- ${c.id} (${c.label}): ${c.scope}`).join("\n");

/**
 * Classifies a report's description into one of the app's category ids and
 * an urgency level with a strict JSON schema response. When a photo analysis
 * is supplied (lib/vision.ts), what the image shows goes to the model
 * alongside the text and outweighs it where the two conflict.
 */
export async function classifyReport(
  description: string,
  visionAnalysis?: VisionAnalysis | null
): Promise<ClassificationResult> {
  const truncated = description.slice(0, MAX_DESCRIPTION_CHARS);

  let userMessage = `Report description: "${truncated}"`;
  if (visionAnalysis) {
    userMessage +=
      "\n\nPhoto analysis:\n" +
      `- visible objects: ${visionAnalysis.objects.join(", ") || "none listed"}\n` +
      `- condition: ${visionAnalysis.condition}\n` +
      `- visual summary: ${visionAnalysis.visual_summary}`;
  }

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "report_classification",
          strict: true,
          schema: {
            type: "object",
            properties: {
              category: { type: "string", enum: CATEGORY_IDS },
              urgency: { type: "string", enum: ["low", "medium", "high"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              reasoning: { type: "string" },
            },
            required: ["category", "urgency", "confidence", "reasoning"],
            additionalProperties: false,
          },
        },
      },
    });
  } catch (err) {
    if (isBudgetExceeded(err)) throw new AIBudgetExceededError();
    throw err;
  }

  logUsage("classifyReport", completion.usage);

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("classifyReport: empty response from OpenAI");

  const parsed = JSON.parse(raw) as ClassificationResult;
  return parsed;
}

async function embedText(text: string): Promise<number[]> {
  const truncated = text.slice(0, MAX_EMBED_CHARS);

  let res;
  try {
    res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: truncated,
    });
  } catch (err) {
    if (isBudgetExceeded(err)) throw new AIBudgetExceededError();
    throw err;
  }

  logUsage("embedText", res.usage);
  return res.data[0].embedding;
}

/**
 * The text duplicate detection compares. The quality gate's normalized
 * restatement is a cleaner signal than the citizen's raw wording, and the
 * photo's visual summary and object list let two reports about the same thing
 * match on what their photos show rather than on phrasing alone. Falls back to
 * the raw description when the gate was unavailable.
 */
export function buildEmbedInput(report: NewReportForDupCheck): string {
  const parts = [report.normalizedDescription?.trim() || report.description];

  const vision = report.visionAnalysis;
  if (vision) {
    if (vision.visual_summary) parts.push(vision.visual_summary);
    if (vision.objects.length) parts.push(vision.objects.join(", "));
  }

  return parts.join("\n");
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function parseEmbedding(value: unknown): number[] | null {
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as number[];
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Embeds the new report's normalized description together with its photo's
 * visual summary and objects, stores the vector in report_embeddings, and
 * checks it against open reports (submitted/in_progress) from the last 90
 * days. Candidates are scoped to the same `area` as the new report; a
 * candidate missing `area` (an old row from before that column was
 * populated) falls back to the ~250m radius check instead. Returns the
 * closest match above the similarity threshold, or null if none.
 */
export async function findDuplicates(newReport: NewReportForDupCheck): Promise<DuplicateMatch | null> {
  const embedding = await embedText(buildEmbedInput(newReport));

  const { error: embedInsertError } = await supabaseAdmin
    .from("report_embeddings")
    .insert({ report_id: newReport.id, embedding });

  if (embedInsertError) {
    console.error("findDuplicates: failed to store embedding", embedInsertError);
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error } = await supabaseAdmin
    .from("reports")
    .select("id, ticket_code, latitude, longitude, area, report_embeddings(embedding)")
    .in("status", ["submitted", "in_progress"])
    .neq("id", newReport.id)
    .gte("created_at", since);

  if (error || !candidates) {
    if (error) console.error("findDuplicates: candidate query failed", error);
    return null;
  }

  let best: DuplicateMatch | null = null;

  for (const candidate of candidates as unknown as Array<{
    id: string;
    ticket_code: string;
    latitude: number | null;
    longitude: number | null;
    area: string | null;
    report_embeddings: { embedding: unknown } | { embedding: unknown }[] | null;
  }>) {
    const sameArea = newReport.area != null && candidate.area != null && candidate.area === newReport.area;

    if (!sameArea) {
      // Both sides have a known area and it differs — not the same place,
      // skip without falling back to distance.
      if (newReport.area != null && candidate.area != null) continue;

      if (
        newReport.latitude == null ||
        newReport.longitude == null ||
        candidate.latitude == null ||
        candidate.longitude == null
      ) {
        continue;
      }
      const distance = haversineMeters(
        newReport.latitude,
        newReport.longitude,
        candidate.latitude,
        candidate.longitude
      );
      if (distance > NEARBY_RADIUS_METERS) continue;
    }

    const embeddingRow = Array.isArray(candidate.report_embeddings)
      ? candidate.report_embeddings[0]
      : candidate.report_embeddings;
    const candidateEmbedding = parseEmbedding(embeddingRow?.embedding);
    if (!candidateEmbedding) continue;

    const similarity = cosineSimilarity(embedding, candidateEmbedding);
    if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD && (!best || similarity > best.similarity)) {
      best = { reportId: candidate.id, ticketCode: candidate.ticket_code, similarity };
    }
  }

  return best;
}
