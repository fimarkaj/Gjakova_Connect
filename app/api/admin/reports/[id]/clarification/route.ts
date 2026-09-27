import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendClarificationEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Access to this route is gated by middleware.ts (shared admin password via
// HTTP Basic Auth on /api/admin/*), so no per-request identity check happens here.
// Only ever called from a clerk approving the drafted clarification in /admin
// (see ./generate) — nothing sends this email automatically.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const payload = await req.json().catch(() => null);
  const subject: string | undefined = payload?.subject?.trim() || undefined;
  const body: string | undefined = payload?.body?.trim() || undefined;

  if (!subject || !body) {
    return NextResponse.json({ error: "Subject and body are required." }, { status: 400 });
  }

  const { data: report, error } = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  if (!report.notify_email) {
    return NextResponse.json({ error: "This report has no contact address." }, { status: 400 });
  }
  if (!EMAIL_RE.test(report.notify_email)) {
    return NextResponse.json({ error: "The contact address is invalid." }, { status: 400 });
  }

  let result: { sent: boolean; demo: boolean };
  try {
    result = await sendClarificationEmail({ to: report.notify_email, subject, body });
  } catch (err) {
    console.error("clarification: send failed", err);
    return NextResponse.json({ error: "Sending the email failed — please try again." }, { status: 500 });
  }

  // Stamped only on a real send, so the panel's "already asked" line never
  // appears for a demo-mode run that sent nothing.
  let clarificationSentAt: string | null = null;
  if (result.sent) {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("reports")
      .update({ clarification_sent_at: new Date().toISOString() })
      .eq("id", report.id)
      .select("clarification_sent_at")
      .single();

    if (updateError || !updated) {
      console.error("clarification: timestamp update failed", updateError);
    } else {
      clarificationSentAt = updated.clarification_sent_at as string;
    }
  }

  return NextResponse.json({ ...result, clarificationSentAt });
}
