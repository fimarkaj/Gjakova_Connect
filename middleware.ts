import { NextRequest, NextResponse } from "next/server";

// Shared staff password for the admin dashboard — no accounts, no citizen
// data involved. Set ADMIN_PASSWORD in the environment to enable access.
function unauthorized() {
  return new NextResponse("Autentikim i kërkuar.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Admin", charset="UTF-8"' },
  });
}

export function middleware(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return unauthorized();

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return unauthorized();

  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  const password = separatorIndex === -1 ? decoded : decoded.slice(separatorIndex + 1);

  if (password !== adminPassword) return unauthorized();

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
