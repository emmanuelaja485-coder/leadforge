import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Helper used by all API routes to verify the current user from the session cookie.
 * Returns the user or null. API routes should return 401 if null.
 */
export async function getCurrentUser(req: NextRequest) {
  const cookie = req.cookies.get("leadforge_session")?.value;
  if (!cookie) return null;

  const [userId, token] = cookie.split(":");
  if (!userId || !token) return null;

  const prisma = await db;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  return user;
}

// GET /api/auth/me — return current user from session cookie
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  return NextResponse.json({ user });
}
