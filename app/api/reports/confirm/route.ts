import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendReportStatusEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id: string | undefined = body?.id;
  const action: string | undefined = body?.action;
  const ticketCode: string | undefined = body?.ticketCode;

  if (!id || (action !== "confirm" && action !== "reopen") || !ticketCode) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data: report, error: fetchError } = await supabaseAdmin
    .from("reports")
    .select("id, ticket_code, status, notify_email")
    .eq("id", id)
    .single();

  if (fetchError || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  if (report.status !== "resolved") {
    return NextResponse.json({ error: "The report is not in the 'Resolved' status." }, { status: 400 });
  }
  if (ticketCode.trim().toLowerCase() !== report.ticket_code.toLowerCase()) {
    return NextResponse.json({ error: "You are not authorized for this action." }, { status: 403 });
  }

  const nextStatus = action === "confirm" ? "confirmed_resolved" : "reopened";

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("reports")
    .update({ status: nextStatus })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: "Something went wrong — please try again." }, { status: 500 });
  }

  if (report.notify_email) {
    const trackingUrl = `${new URL(req.url).origin}/raportimet-e-mia?ticket=${encodeURIComponent(report.ticket_code)}`;
    await sendReportStatusEmail({
      to: report.notify_email,
      ticketCode: report.ticket_code,
      status: nextStatus,
      trackingUrl,
    });
  }

  return NextResponse.json({ report: updated });
}
