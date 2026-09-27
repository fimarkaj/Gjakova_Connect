import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateClarification } from "@/lib/email-clarification";
import { AIBudgetExceededError } from "@/lib/ai";

// Access to this route is gated by middleware.ts (shared admin password via
// HTTP Basic Auth on /api/admin/*), so no per-request identity check happens here.
//
// Drafts the clarification email for the clerk to review. It never sends
// anything — the clerk edits the result and POSTs it to .. to send. Unlike the
// work-order generator there is no fallback template: a failure is returned as
// an error so the clerk cannot mistake a canned letter for one written about
// this report.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data: report, error } = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !report) {
    return NextResponse.json({ error: "Raportimi nuk u gjet." }, { status: 404 });
  }
  if (!report.notify_email) {
    return NextResponse.json(
      { error: "Ky raportim nuk ka adresë kontakti." },
      { status: 400 }
    );
  }

  try {
    // Only the three fields the email may mention are passed — notify_email is
    // not among them, so the citizen's address never reaches the model.
    const clarification = await generateClarification(
      {
        ticket_code: report.ticket_code,
        description: report.description,
        area: report.area,
      },
      report.flag_reason
    );

    return NextResponse.json({ subject: clarification.subject, body: clarification.body });
  } catch (err) {
    console.error("clarification/generate: generation failed", err);
    const message =
      err instanceof AIBudgetExceededError
        ? "Buxheti i AI-së është shpenzuar — email-i nuk u përgatit."
        : "Gjenerimi i email-it dështoi — provo përsëri.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
