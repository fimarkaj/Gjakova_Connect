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
    return NextResponse.json({ error: "Raportimi nuk u gjet." }, { status: 404 });
  }

  return NextResponse.json({ report });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const status: string | undefined = body?.status;

  if (!status || !STAFF_STATUSES.includes(status as ReportStatus)) {
    return NextResponse.json({ error: "Status i pavlefshëm." }, { status: 400 });
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
    return NextResponse.json({ error: "Diçka shkoi keq — provo përsëri." }, { status: 500 });
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
