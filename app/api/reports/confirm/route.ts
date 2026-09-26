import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id: string | undefined = body?.id;
  const action: string | undefined = body?.action;
  const ticketCode: string | undefined = body?.ticketCode;
  const accessToken: string | undefined = body?.accessToken;

  if (!id || (action !== "confirm" && action !== "reopen")) {
    return NextResponse.json({ error: "Kërkesë e pavlefshme." }, { status: 400 });
  }

  const { data: report, error: fetchError } = await supabaseAdmin
    .from("reports")
    .select("id, ticket_code, status, reporter_id")
    .eq("id", id)
    .single();

  if (fetchError || !report) {
    return NextResponse.json({ error: "Raportimi nuk u gjet." }, { status: 404 });
  }
  if (report.status !== "resolved") {
    return NextResponse.json({ error: "Raportimi nuk është në statusin 'Zgjidhur'." }, { status: 400 });
  }

  let authorized = false;

  if (accessToken) {
    const { data: userData } = await supabaseAdmin.auth.getUser(accessToken);
    if (userData.user && report.reporter_id && userData.user.id === report.reporter_id) {
      authorized = true;
    }
  }
  if (!authorized && ticketCode && ticketCode.trim().toLowerCase() === report.ticket_code.toLowerCase()) {
    authorized = true;
  }

  if (!authorized) {
    return NextResponse.json({ error: "Nuk je i autorizuar për këtë veprim." }, { status: 403 });
  }

  const nextStatus = action === "confirm" ? "confirmed_resolved" : "reopened";

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("reports")
    .update({ status: nextStatus })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: "Diçka shkoi keq — provo përsëri." }, { status: 500 });
  }

  return NextResponse.json({ report: updated });
}
