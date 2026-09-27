import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { STAFF_STATUSES } from "@/lib/types";
import type { ReportStatus } from "@/lib/types";
import { sendReportStatusEmail } from "@/lib/email";

// Access to this route is gated by middleware.ts (shared admin password via
// HTTP Basic Auth on /api/admin/*), so no per-request identity check happens here.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data: report, error } = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  // Send history for the "Send to Department" control — lets /admin show
  // "Sent to X on <date>" without a separate round trip.
  const { data: sendsRaw } = await supabaseAdmin
    .from("report_department_sends")
    .select("department_id, sent_to_email, sent_at, departments(name)")
    .eq("report_id", params.id)
    .order("sent_at", { ascending: false });

  const sends = (sendsRaw ?? []).map((s) => ({
    department_id: s.department_id as string,
    sent_to_email: s.sent_to_email as string,
    sent_at: s.sent_at as string,
    department_name: (Array.isArray(s.departments) ? s.departments[0]?.name : (s.departments as { name: string } | null)?.name) ?? null,
  }));

  return NextResponse.json({ report, sends });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const status: string | undefined = body?.status;

  if (!status || !STAFF_STATUSES.includes(status as ReportStatus)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("reports")
    .select("status, notify_email, ticket_code")
    .eq("id", params.id)
    .single();

  const { data: updated, error } = await supabaseAdmin
    .from("reports")
    .update({ status })
    .eq("id", params.id)
    .select()
    .single();

  if (error || !updated) {
    console.error("admin PATCH: status update failed", error);
    return NextResponse.json({ error: "Something went wrong — please try again." }, { status: 500 });
  }

  if (existing && existing.status !== updated.status && updated.notify_email) {
    const trackingUrl = `${new URL(req.url).origin}/raportimet-e-mia?ticket=${encodeURIComponent(updated.ticket_code)}`;
    await sendReportStatusEmail({
      to: updated.notify_email,
      ticketCode: updated.ticket_code,
      status: updated.status,
      trackingUrl,
    });
  }

  return NextResponse.json({ report: updated });
}
