import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Access to this route is gated by middleware.ts (shared admin password via
// HTTP Basic Auth on /api/admin/*), so no per-request identity check happens here.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    }
    update.name = name;
  }

  if ("category" in body) {
    update.category = body.category || null;
  }

  if ("contact_email" in body) {
    const contactEmail = body.contact_email ? String(body.contact_email).trim() : null;
    if (contactEmail && !EMAIL_RE.test(contactEmail)) {
      return NextResponse.json({ error: "The contact email is invalid." }, { status: 400 });
    }
    update.contact_email = contactEmail;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("departments")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error || !data) {
    console.error("departments PATCH: update failed", error);
    return NextResponse.json({ error: "The department was not updated." }, { status: 500 });
  }

  return NextResponse.json({ department: data });
}
