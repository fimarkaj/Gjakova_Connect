import "server-only";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CATEGORIES } from "@/lib/types";

const openai = new OpenAI({ apiKey: process.env.AI_API_KEY, baseURL: process.env.AI_BASE_URL });

export class AIBudgetExceededError extends Error {
  constructor(message = "AI proxy budget exceeded") {
    super(message);
    this.name = "AIBudgetExceededError";
  }
}

function isBudgetExceeded(err: unknown): boolean {
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
};

export type NewReportForDupCheck = {
  id: string;
  description: string;
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
const MAX_DESCRIPTION_CHARS = 500;

type OpenAIUsage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null | undefined;

function logUsage(label: string, usage: OpenAIUsage) {
  if (!usage) return;
  console.log(
    `[ai] ${label} — prompt_tokens=${usage.prompt_tokens ?? "?"} completion_tokens=${usage.completion_tokens ?? "?"} total_tokens=${usage.total_tokens ?? "?"}`
  );
}

/**
 * Classifies a report's description into one of the app's category ids and
 * an urgency level with a strict JSON schema response. Uses gpt-5-mini
 * (confirmed available and working on the configured AI_BASE_URL proxy) —
 * not gpt-4o-mini as originally specced, but verified to return
 * well-formed, schema-conformant classifications.
 */
export async function classifyReport(description: string): Promise<ClassificationResult> {
  const truncated = description.slice(0, MAX_DESCRIPTION_CHARS);

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content:
            "You classify municipal issue reports submitted by residents of Gjakova, Kosovo. " +
            "Descriptions are written in Albanian. Pick the single best-fitting category, " +
            "estimate urgency for public safety/services, and give your confidence in the category choice.",
        },
        { role: "user", content: `Report description: "${truncated}"` },
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
            },
            required: ["category", "urgency", "confidence"],
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

async function embedDescription(description: string): Promise<number[]> {
  const truncated = description.slice(0, MAX_DESCRIPTION_CHARS);

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

  logUsage("embedDescription", res.usage);
  return res.data[0].embedding;
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

function cosineSimilarity(a: number[], b: number[]): number {
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

function parseEmbedding(value: unknown): number[] | null {
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
 * Embeds the new report's description, stores it in report_embeddings, and
 * checks it against open reports (submitted/in_progress) from the last 90
 * days. Candidates are scoped to the same `area` as the new report; a
 * candidate missing `area` (an old row from before that column was
 * populated) falls back to the ~250m radius check instead. Returns the
 * closest match above the similarity threshold, or null if none.
 */
export async function findDuplicates(newReport: NewReportForDupCheck): Promise<DuplicateMatch | null> {
  const embedding = await embedDescription(newReport.description);

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
