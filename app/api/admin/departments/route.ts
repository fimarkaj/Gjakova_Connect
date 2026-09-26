import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Access to this route is gated by middleware.ts (shared admin password via
// HTTP Basic Auth on /api/admin/*), so no per-request identity check happens here.
export async function GET() {
  const { data, error } = await supabaseAdmin.from("departments").select("*").order("name");

  if (error) {
    console.error("departments GET: query failed", error);
    return NextResponse.json({ error: "Departamentet nuk u ngarkuan." }, { status: 500 });
  }

  return NextResponse.json({ departments: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name: string | undefined = body?.name?.trim();
  const category: string | null = body?.category || null;
  const contactEmail: string | null = body?.contact_email?.trim() || null;

  if (!name) {
    return NextResponse.json({ error: "Emri i departamentit mungon." }, { status: 400 });
  }
  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    return NextResponse.json({ error: "Email-i i kontaktit është i pavlefshëm." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("departments")
    .insert({ name, category, contact_email: contactEmail })
    .select()
    .single();

  if (error || !data) {
    console.error("departments POST: insert failed", error);
    return NextResponse.json({ error: "Departamenti nuk u krijua." }, { status: 500 });
  }

  return NextResponse.json({ department: data });
}
