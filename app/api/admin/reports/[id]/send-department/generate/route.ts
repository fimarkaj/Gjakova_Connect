import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildDepartmentEmail } from "@/lib/email";
import { generateWorkOrder } from "@/lib/email-workorder";
import { AIBudgetExceededError } from "@/lib/ai";
import { categoryLabel } from "@/lib/types";
import type { VisionAnalysis } from "@/lib/vision";

// Access to this route is gated by middleware.ts (shared admin password via
// HTTP Basic Auth on /api/admin/*), so no per-request identity check happens here.
//
// Generates the work order for the clerk to review. It never sends anything —
// the clerk edits the result and POSTs it to ../send-department to send. On a
// generation failure it returns the fixed template with fallback: true so the
// clerk sees exactly what would go out and is told why it is not AI-written.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const departmentId: string | undefined = body?.departmentId;
  const adminNote: string | null = typeof body?.adminNote === "string" ? body.adminNote : null;

  if (!departmentId) {
    return NextResponse.json({ error: "Department is missing." }, { status: 400 });
  }

  const [{ data: report, error: reportError }, { data: department, error: deptError }] = await Promise.all([
    supabaseAdmin.from("reports").select("*").eq("id", params.id).single(),
    supabaseAdmin.from("departments").select("*").eq("id", departmentId).single(),
  ]);

  if (reportError || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  if (deptError || !department) {
    return NextResponse.json({ error: "Department not found." }, { status: 404 });
  }

  const mapsUrl =
    report.latitude != null && report.longitude != null
      ? `https://www.google.com/maps?q=${report.latitude},${report.longitude}`
      : null;

  const templateParams = {
    departmentName: department.name as string,
    ticketCode: report.ticket_code as string,
    categoryLabel: categoryLabel(report.category),
    area: report.area as string | null,
    description: report.description as string,
    mapsUrl,
    photoUrl: report.photo_url as string | null,
  };

  try {
    // Only the fields a work order may mention are passed — notify_email is
    // never among them, so the citizen's address cannot reach the model.
    const workOrder = await generateWorkOrder(
      {
        ticket_code: report.ticket_code,
        category: report.category,
        departmentName: department.name,
        area: report.area,
        latitude: report.latitude,
        longitude: report.longitude,
        description: report.description,
        normalized_description: report.normalized_description,
        urgency: report.urgency,
        reasoning: report.reasoning,
      },
      (report.vision_analysis as VisionAnalysis | null) ?? null,
      adminNote
    );

    return NextResponse.json({
      subject: workOrder.subject,
      body: workOrder.body,
      fallback: false,
      departmentName: department.name,
      hasContactEmail: Boolean(department.contact_email),
    });
  } catch (err) {
    const reason =
      err instanceof AIBudgetExceededError
        ? "The AI budget has been used up."
        : "AI generation failed.";
    console.error("send-department/generate: work order generation failed", err);

    const template = buildDepartmentEmail(templateParams);
    return NextResponse.json({
      subject: template.subject,
      body: template.body,
      fallback: true,
      fallbackReason: `${reason} This text is the standard template, not AI-generated.`,
      departmentName: department.name,
      hasContactEmail: Boolean(department.contact_email),
    });
  }
}
