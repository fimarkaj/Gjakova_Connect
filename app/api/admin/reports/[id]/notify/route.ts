import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendReportStatusEmail } from "@/lib/email";

// Access to this route is gated by middleware.ts (shared admin password via
// HTTP Basic Auth on /api/admin/*), so no per-request identity check happens here.
// Separate from the automatic status-change email — lets staff reach out
// on demand (e.g. asking for more info) without changing the report's status.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const customMessage: string | undefined = body?.message?.trim() || undefined;

  const { data: report, error } = await supabaseAdmin
    .from("reports")
    .select("ticket_code, status, notify_email")
    .eq("id", params.id)
    .single();

  if (error || !report) {
    return NextResponse.json({ error: "Raportimi nuk u gjet." }, { status: 404 });
  }
  if (!report.notify_email) {
    return NextResponse.json({ error: "Ky raportim nuk ka email për njoftime." }, { status: 400 });
  }

  const trackingUrl = `${new URL(req.url).origin}/raportimet-e-mia?ticket=${encodeURIComponent(report.ticket_code)}`;
  const result = await sendReportStatusEmail({
    to: report.notify_email,
    ticketCode: report.ticket_code,
    status: report.status,
    trackingUrl,
    customMessage,
  });

  return NextResponse.json(result);
}
