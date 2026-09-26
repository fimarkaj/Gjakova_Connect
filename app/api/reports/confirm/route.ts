import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id: string | undefined = body?.id;
  const action: string | undefined = body?.action;
  const ticketCode: string | undefined = body?.ticketCode;

  if (!id || (action !== "confirm" && action !== "reopen") || !ticketCode) {
    return NextResponse.json({ error: "Kërkesë e pavlefshme." }, { status: 400 });
  }

  const { data: report, error: fetchError } = await supabaseAdmin
    .from("reports")
    .select("id, ticket_code, status")
    .eq("id", id)
    .single();

  if (fetchError || !report) {
    return NextResponse.json({ error: "Raportimi nuk u gjet." }, { status: 404 });
  }
  if (report.status !== "resolved") {
    return NextResponse.json({ error: "Raportimi nuk është në statusin 'Zgjidhur'." }, { status: 400 });
  }
  if (ticketCode.trim().toLowerCase() !== report.ticket_code.toLowerCase()) {
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
