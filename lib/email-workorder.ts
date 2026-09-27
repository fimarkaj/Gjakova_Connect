import "server-only";
import { openai, AI_MODEL, AIBudgetExceededError, isBudgetExceeded, logUsage } from "@/lib/ai";
import { categoryLabel, URGENCY_LABELS } from "@/lib/types";
import type { VisionAnalysis } from "@/lib/vision";

// The language every generated work order is written in. Substituted into
// WORKORDER_SYSTEM_PROMPT in place of {{LANGUAGE}}.
export const EMAIL_LANGUAGE = "sq";

const WORKORDER_SYSTEM_PROMPT_TEMPLATE = `You write internal work-order emails for the Municipality of Gjakova's Public Services
Directorate. The recipient is the contractor or crew that will carry out the repair — never
the citizen who reported it.

Write in {{LANGUAGE}}. Register is formal and administrative, the way a directorate writes to
a contractor. No greeting beyond a single formal opening line, no apologies, no filler.

Body contains, in this order:
1. Ticket code and department.
2. Location: the area name, plus coordinates when present.
3. The reported problem, in one or two factual sentences.
4. Observed condition from the photo analysis, when one is supplied.
5. Assessed urgency, and one sentence on why.
6. The administrator's note, when supplied, reproduced faithfully and clearly marked as
   coming from the administrator.

Hard rules:
- Use only facts present in the supplied report data. Never invent a deadline, a cost, a crew
  name, a materials list, a measurement, or a municipal policy.
- Never promise a response time unless one is present in the supplied data.
- Never include the citizen's name, email, or any personal identifier.
- If a field is missing, omit that line entirely. Do not write "unknown" or guess.
- Body maximum 180 words. Subject maximum 12 words, containing the ticket code.
- Plain text. No markdown, no bullet characters, no emoji.

Return only the JSON object with subject and body. No commentary.`;

export const WORKORDER_SYSTEM_PROMPT = WORKORDER_SYSTEM_PROMPT_TEMPLATE.replace(
  "{{LANGUAGE}}",
  EMAIL_LANGUAGE
);

export type WorkOrder = { subject: string; body: string };

/**
 * The report fields a work order may mention. Deliberately a narrow explicit
 * shape rather than the reports row: notify_email must never reach the model,
 * and building this object by hand is what guarantees it cannot.
 */
export type WorkOrderReport = {
  ticket_code: string;
  category: string | null;
  departmentName: string;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string;
  normalized_description: string | null;
  urgency: string | null;
  reasoning: string | null;
};

/**
 * Writes the work-order email a department's crew receives for a report.
 *
 * Throws on any failure — the caller falls back to the fixed template in
 * lib/email.ts and tells the clerk that is what happened, so a generation
 * failure is never silent and never blocks the send.
 */
export async function generateWorkOrder(
  report: WorkOrderReport,
  visionAnalysis: VisionAnalysis | null,
  adminNote: string | null
): Promise<WorkOrder> {
  if (!process.env.AI_API_KEY) throw new Error("generateWorkOrder: AI_API_KEY is not set");

  // Only fields present are sent, so the model has nothing to guess at and the
  // "omit missing lines" rule has an unambiguous input.
  const facts: string[] = [
    `Ticket code: ${report.ticket_code}`,
    `Department: ${report.departmentName}`,
    `Category: ${categoryLabel(report.category)}`,
  ];

  if (report.area) facts.push(`Area: ${report.area}`);
  if (report.latitude != null && report.longitude != null) {
    facts.push(`Coordinates: ${report.latitude}, ${report.longitude}`);
  }

  facts.push(`Reported problem: ${report.normalized_description || report.description}`);

  if (report.urgency) {
    const label = URGENCY_LABELS[report.urgency]?.label ?? report.urgency;
    facts.push(`Assessed urgency: ${report.urgency} (${label})`);
  }
  if (report.reasoning) facts.push(`Classifier reasoning: ${report.reasoning}`);

  if (visionAnalysis) {
    facts.push(
      `Photo analysis — condition: ${visionAnalysis.condition}`,
      `Photo analysis — visible objects: ${visionAnalysis.objects.join(", ")}`,
      `Photo analysis — summary: ${visionAnalysis.visual_summary}`,
      `Photo analysis — visible severity: ${visionAnalysis.severity}`
    );
  }

  if (adminNote?.trim()) facts.push(`Administrator note: ${adminNote.trim()}`);

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: WORKORDER_SYSTEM_PROMPT },
        { role: "user", content: `Report data:\n${facts.join("\n")}` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "work_order",
          strict: true,
          schema: {
            type: "object",
            properties: {
              subject: { type: "string" },
              body: { type: "string" },
            },
            required: ["subject", "body"],
            additionalProperties: false,
          },
        },
      },
    });
  } catch (err) {
    if (isBudgetExceeded(err)) throw new AIBudgetExceededError();
    throw err;
  }

  logUsage("generateWorkOrder", completion.usage);

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("generateWorkOrder: empty response from OpenAI");

  const parsed = JSON.parse(raw) as WorkOrder;
  if (!parsed.subject?.trim() || !parsed.body?.trim()) {
    throw new Error("generateWorkOrder: response missing subject or body");
  }
  return parsed;
}
