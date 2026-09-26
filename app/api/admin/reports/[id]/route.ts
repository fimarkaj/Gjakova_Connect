import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { STAFF_STATUSES } from "@/lib/types";
import type { ReportStatus } from "@/lib/types";

// Staff are identified by email until an admin role is modeled in the database.
// ADMIN_EMAILS is a comma-separated list, e.g. "ana@gjakova.org,besim@gjakova.org".
function staffEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const status: string | undefined = body?.status;
  const accessToken: string | undefined = body?.accessToken;

  if (!status || !STAFF_STATUSES.includes(status as ReportStatus)) {
    return NextResponse.json({ error: "Status i pavlefshëm." }, { status: 400 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Hyr me llogarinë e stafit për të ndryshuar statusin." }, { status: 401 });
  }

  const { data: userData } = await supabaseAdmin.auth.getUser(accessToken);
  const email = userData.user?.email?.toLowerCase();
  if (!email || !staffEmails().includes(email)) {
    return NextResponse.json({ error: "Vetëm stafi mund ta ndryshojë statusin." }, { status: 403 });
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
