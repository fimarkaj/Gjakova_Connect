import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  const file = formData?.get("photo");

  if (!file || !(file instanceof File) || !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Foto e pavlefshme." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Foto është shumë e madhe." }, { status: 400 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  let outputBuffer: Buffer;
  try {
    // .rotate() with no args bakes in the EXIF orientation before the pipe
    // re-encodes the pixels — since .withMetadata() is never called, the
    // output carries no EXIF/GPS/location metadata at all.
    outputBuffer = await sharp(inputBuffer).rotate().jpeg({ quality: 85 }).toBuffer();
  } catch (err) {
    console.error("reports/photo POST: sharp processing failed", err);
    return NextResponse.json({ error: "Foto nuk mund të përpunohej." }, { status: 400 });
  }

  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("report-photos")
    .upload(path, outputBuffer, { contentType: "image/jpeg" });

  if (uploadError) {
    console.error("reports/photo POST: upload failed", uploadError);
    return NextResponse.json({ error: "Diçka shkoi keq — provo përsëri." }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from("report-photos").getPublicUrl(path);

  return NextResponse.json({ photoUrl: publicUrl });
}
