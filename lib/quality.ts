import "server-only";
import {
  openai,
  AI_MODEL,
  MAX_DESCRIPTION_CHARS,
  AIBudgetExceededError,
  isBudgetExceeded,
  logUsage,
} from "@/lib/ai";

export const QUALITY_SYSTEM_PROMPT = `You screen citizen reports submitted to the Municipality of Gjakova, Kosovo, before they
reach municipal staff. Input is usually Albanian, sometimes English, often informal or
misspelled.

You do two things: decide whether the report is usable, and if it is, rewrite it in a
standard format.

Set usable = false only when the report cannot be acted on:
- Empty, a single character, or mashed/repeated characters
- Unintelligible even allowing for heavy misspelling and dialect
- Describes nothing related to municipal infrastructure, waste, water, lighting or
  environment
- Obvious abuse, spam, or a joke submission

Set usable = true for everything else. Specifically do NOT flag a report for:
- Bad grammar, phonetic spelling, or Gheg dialect
- Being very short, if it is clear (e.g. "gropë te rruga e Prizrenit" is perfectly usable)
- Being angry or rude, as long as a real problem is described
- Mixing Albanian and English

When usable is false, flag_reason is one short sentence in Albanian explaining why, written
for a municipal clerk to read. normalized_description is null.

When usable is true, flag_reason is null and normalized_description restates the report in
this exact structure, in Albanian:
  Problemi: <what the problem is, one sentence>
  Vendndodhja: <location detail found in the text, or "Nuk është specifikuar">
  Ndikimi: <who or what it affects, one sentence>

Hard rules for normalization:
- Use only information present in the citizen's text. Never add a cause, a severity, a
  measurement, a street name, or a time that the citizen did not write.
- If the text contains no location detail at all, write "Nuk është specifikuar".
- Keep it factual and neutral. Strip insults and emotion, keep the facts they carried.
- Maximum 60 words total.

confidence is 0.0-1.0 reflecting how sure you are of the usable verdict.

Return only the JSON object matching the schema. No commentary.`;

export type QualityAssessment = {
  usable: boolean;
  flag_reason: string | null;
  normalized_description: string | null;
  confidence: number;
};

/**
 * Screens a citizen's report before it reaches the classification and
 * duplicate-detection pipeline. Throws on any failure — callers must treat a
 * throw as "gate unavailable" and let the submission through unflagged.
 */
export async function assessReport(description: string): Promise<QualityAssessment> {
  if (!process.env.AI_API_KEY) throw new Error("assessReport: AI_API_KEY is not set");

  const truncated = description.slice(0, MAX_DESCRIPTION_CHARS);

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: QUALITY_SYSTEM_PROMPT },
        { role: "user", content: `Report description: "${truncated}"` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "report_quality",
          strict: true,
          schema: {
            type: "object",
            properties: {
              usable: { type: "boolean" },
              flag_reason: { type: ["string", "null"] },
              normalized_description: { type: ["string", "null"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["usable", "flag_reason", "normalized_description", "confidence"],
            additionalProperties: false,
          },
        },
      },
    });
  } catch (err) {
    if (isBudgetExceeded(err)) throw new AIBudgetExceededError();
    throw err;
  }

  logUsage("assessReport", completion.usage);

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("assessReport: empty response from OpenAI");

  return JSON.parse(raw) as QualityAssessment;
}
