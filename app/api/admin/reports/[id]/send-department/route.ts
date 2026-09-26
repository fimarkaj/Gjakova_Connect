import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendDepartmentReportEmail } from "@/lib/email";
import { categoryLabel } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Access to this route is gated by middleware.ts (shared admin password via
// HTTP Basic Auth on /api/admin/*), so no per-request identity check happens here.
// Only ever called from a clerk clicking "Send to Department" in /admin —
// there is no automatic trigger for this send.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const departmentId: string | undefined = body?.departmentId;

  if (!departmentId) {
    return NextResponse.json({ error: "Departamenti mungon." }, { status: 400 });
  }

  const [{ data: report, error: reportError }, { data: department, error: deptError }] = await Promise.all([
    supabaseAdmin.from("reports").select("*").eq("id", params.id).single(),
    supabaseAdmin.from("departments").select("*").eq("id", departmentId).single(),
  ]);

  if (reportError || !report) {
    return NextResponse.json({ error: "Raportimi nuk u gjet." }, { status: 404 });
  }
  if (deptError || !department) {
    return NextResponse.json({ error: "Departamenti nuk u gjet." }, { status: 404 });
  }
  if (!department.contact_email) {
    return NextResponse.json({ error: "Ky departament nuk ka email kontakti." }, { status: 400 });
  }
  if (!EMAIL_RE.test(department.contact_email)) {
    return NextResponse.json({ error: "Email-i i departamentit është i pavlefshëm." }, { status: 400 });
  }

  let photoAttachment: { filename: string; content: Buffer; contentType: string } | null = null;
  if (report.photo_url) {
    try {
      const res = await fetch(report.photo_url);
      if (!res.ok) throw new Error(`unexpected status ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") || "image/jpeg";
      const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
      photoAttachment = { filename: `${report.ticket_code}.${ext}`, content: buffer, contentType };
    } catch (err) {
      console.error("send-department: photo fetch failed", err);
      return NextResponse.json({ error: "Foto e raportimit nuk u shkarkua për bashkëngjitje." }, { status: 502 });
    }
  }

  const mapsUrl =
    report.latitude != null && report.longitude != null
      ? `https://www.google.com/maps?q=${report.latitude},${report.longitude}`
      : null;

  let result: { sent: boolean; demo: boolean };
  try {
    result = await sendDepartmentReportEmail({
      to: department.contact_email,
      departmentName: department.name,
      ticketCode: report.ticket_code,
      categoryLabel: categoryLabel(report.category),
      area: report.area,
      description: report.description,
      mapsUrl,
      photoUrl: report.photo_url,
      photoAttachment,
    });
  } catch (err) {
    console.error("send-department: send failed", err);
    return NextResponse.json({ error: "Dërgimi i email-it dështoi — provo përsëri." }, { status: 500 });
  }

  if (result.sent) {
    const { error: insertError } = await supabaseAdmin.from("report_department_sends").insert({
      report_id: report.id,
      department_id: department.id,
      sent_to_email: department.contact_email,
    });
    if (insertError) console.error("send-department: audit log insert failed", insertError);
  }

  return NextResponse.json({ ...result, departmentName: department.name });
}
