import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { STAFF_STATUSES } from "@/lib/types";
import type { ReportStatus } from "@/lib/types";

// Access to this route is gated by middleware.ts (shared admin password via
// HTTP Basic Auth on /api/admin/*), so no per-request identity check happens here.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const status: string | undefined = body?.status;

  if (!status || !STAFF_STATUSES.includes(status as ReportStatus)) {
    return NextResponse.json({ error: "Status i pavlefshëm." }, { status: 400 });
  }

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

  return NextResponse.json({ report: updated });
}
