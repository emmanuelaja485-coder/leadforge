import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// POST /api/auth/logout — clear session cookie
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("leadforge_session");
  return res;
}
