import "server-only";
import { openai, AI_MODEL, AIBudgetExceededError, isBudgetExceeded, logUsage } from "@/lib/ai";
import { EMAIL_LANGUAGE } from "@/lib/email-workorder";

const CLARIFICATION_SYSTEM_PROMPT_TEMPLATE = `You write short emails from the Municipality of Gjakova to a citizen whose report could not
be processed because it lacked usable detail.

Write in {{LANGUAGE}}. Register is polite, plain and respectful — a public institution
writing to a resident, not a support ticket auto-reply.

The email must:
- Thank the citizen for reporting, briefly.
- State plainly that more detail is needed before the report can be assigned, without quoting
  the internal flag reason verbatim and without implying the citizen did something wrong.
- Ask for two or three specific things that would make it actionable: what exactly is damaged
  or wrong, where precisely (street, landmark, near which building), and a photo if possible.
- Give the ticket code and say the report stays open and can be updated.

Hard rules:
- Never accuse, never call the report invalid, spam, or a joke, even when the internal flag
  reason says so.
- Never invent a deadline, a phone number, an office address, an officer's name, or a policy.
- Never promise when the problem will be fixed.
- Maximum 120 words. Subject maximum 10 words, containing the ticket code.
- Plain text. No markdown, no emoji.

Return only the JSON object with subject and body. No commentary.`;

export const CLARIFICATION_SYSTEM_PROMPT = CLARIFICATION_SYSTEM_PROMPT_TEMPLATE.replace(
  "{{LANGUAGE}}",
  EMAIL_LANGUAGE
);

export type Clarification = { subject: string; body: string };

/**
 * The report fields a clarification email may mention. Narrow and explicit for
 * the same reason as WorkOrderReport: notify_email is not on it, so the
 * citizen's address cannot reach the model even though this email is addressed
 * to them.
 */
export type ClarificationReport = {
  ticket_code: string;
  description: string;
  area: string | null;
};

/**
 * Writes the email asking a citizen for the detail a flagged report is missing.
 *
 * Throws on any failure. There is no fallback template on purpose — a clerk
 * must never send a generic "tell us more" letter believing it was written for
 * this report; the caller surfaces the failure instead.
 */
export async function generateClarification(
  report: ClarificationReport,
  flagReason: string | null
): Promise<Clarification> {
  if (!process.env.AI_API_KEY) throw new Error("generateClarification: AI_API_KEY is not set");

  const facts: string[] = [
    `Ticket code: ${report.ticket_code}`,
    `What the citizen wrote: ${report.description}`,
  ];

  if (report.area) facts.push(`Area recorded on the report: ${report.area}`);

  // The flag reason is the only signal for what to ask about, but it is an
  // internal clerk-facing note and can be blunt ("looks like a joke"), so it is
  // labeled as such — the prompt forbids quoting or echoing it.
  if (flagReason?.trim()) {
    facts.push(`Internal flag reason, for your understanding only, never quote it: ${flagReason.trim()}`);
  }

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: CLARIFICATION_SYSTEM_PROMPT },
        { role: "user", content: `Report data:\n${facts.join("\n")}` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "clarification_email",
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

  logUsage("generateClarification", completion.usage);

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("generateClarification: empty response from OpenAI");

  const parsed = JSON.parse(raw) as Clarification;
  if (!parsed.subject?.trim() || !parsed.body?.trim()) {
    throw new Error("generateClarification: response missing subject or body");
  }
  return parsed;
}
