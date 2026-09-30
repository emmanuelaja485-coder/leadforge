import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// POST /api/auth/login — verify credentials, return user + session token
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "email and password required" }, { status: 400 });
    }

    const prisma = await db;
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!user) {
      return NextResponse.json({ error: "invalid email or password" }, { status: 401 });
    }

    const valid = bcrypt.compareSync(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "invalid email or password" }, { status: 401 });
    }

    // Generate a simple session token (random 64-char hex) using Web Crypto API
    // (works on both edge runtime and Node.js)
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Set the session token as an HTTP-only cookie
    const res = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
    res.cookies.set("leadforge_session", `${user.id}:${token}`, {
      httpOnly: true,
      sameSite: "lax",
      expires,
      path: "/",
    });

    return res;
  } catch (err: any) {
    console.error("login error:", err);
    return NextResponse.json({ error: err?.message || "login failed" }, { status: 500 });
  }
}
