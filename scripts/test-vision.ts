import { config as loadEnv } from "dotenv";
import Module from "module";
import path from "path";

loadEnv({ path: ".env.local" });

// lib/vision.ts -> lib/ai.ts import "server-only", which throws outside Next's
// server build, and use the "@/*" tsconfig alias that plain node resolution
// doesn't know. Patch both for this standalone run only. (Same shim as
// scripts/test-quality.ts.)
const ROOT = path.resolve(__dirname, "..");
const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  if (request.startsWith("@/")) {
    return originalLoad.call(this, path.join(ROOT, request.slice(2)), ...rest);
  }
  return originalLoad.call(this, request, ...rest);
};

async function main() {
  const { analyzePhoto } = await import("../lib/vision");
  const { createClient } = await import("@supabase/supabase-js");

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await svc
    .from("reports")
    .select("ticket_code, photo_url")
    .not("photo_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(4);

  for (const r of data ?? []) {
    console.log(`\n===== ${r.ticket_code} =====`);
    console.log(r.photo_url);
    const result = await analyzePhoto(r.photo_url as string);
    console.log(JSON.stringify(result, null, 2));
  }

  console.log("\n===== skip paths (must all be null, never throw) =====");
  console.log("null photo_url      ->", await analyzePhoto(null));
  console.log("404 in bucket       ->", await analyzePhoto(
    "https://cqvozuccntezsthlvjrh.supabase.co/storage/v1/object/public/report-photos/does-not-exist.jpg"
  ));
  console.log("not an image        ->", await analyzePhoto("https://example.com/"));
}

main().catch((e) => { console.error(e); process.exit(1); });
