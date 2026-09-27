import { config as loadEnv } from "dotenv";
import Module from "module";
import path from "path";

loadEnv({ path: ".env.local" });

// lib/quality.ts -> lib/ai.ts import "server-only", which throws outside
// Next's server build, and use the "@/*" tsconfig alias that plain node
// resolution doesn't know. Patch both for this standalone run only.
const ROOT = path.resolve(__dirname, "..");
const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  if (request.startsWith("@/")) {
    return originalLoad.call(this, path.join(ROOT, request.slice(2)), ...rest);
  }
  return originalLoad.call(this, request, ...rest);
};

const CASES = [
  "Te rruga e Prizrenit ka nje grope te madhe qe e ka mbushur uji, makinat po kalojne me veshtiresi dhe naten nuk shihet fare.",
  ".",
  "grop tek rrug prizren shum e madhe",
];

async function main() {
  const { assessReport, QUALITY_SYSTEM_PROMPT } = await import("../lib/quality");
  const { AI_MODEL } = await import("../lib/ai");

  console.log(`model in use: ${AI_MODEL}`);
  console.log(`base url: ${process.env.AI_BASE_URL ?? "(unset)"}`);
  console.log(`api key present: ${Boolean(process.env.AI_API_KEY)}`);

  for (let i = 0; i < CASES.length; i++) {
    console.log(`\n===== CASE ${i + 1} =====`);
    console.log(`input: ${JSON.stringify(CASES[i])}`);
    try {
      const result = await assessReport(CASES[i]);
      console.log("raw JSON:");
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.log(`THREW: ${(err as Error).name}: ${(err as Error).message}`);
    }
  }

  const lines = QUALITY_SYSTEM_PROMPT.split("\n");
  console.log(`\n===== QUALITY_SYSTEM_PROMPT: last 15 of ${lines.length} lines =====`);
  console.log(lines.slice(-15).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
