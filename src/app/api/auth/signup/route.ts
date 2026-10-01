import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// POST /api/auth/signup — create a new user
export async function POST(req: NextRequest) {
  const { email, password, name } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "password must be at least 6 chars" }, { status: 400 });
  }

  const prisma = await db;
  const normalized = email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) {
    return NextResponse.json({ error: "email already registered" }, { status: 409 });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const user = await prisma.user.create({
    data: {
      email: normalized,
      passwordHash,
      name: name?.trim() || normalized.split("@")[0],
    },
  });

  // Seed default automation rules for this user
  await prisma.automationRule.createMany({
    data: [
      { userId: user.id, name: "Auto-enrich new leads", type: "auto_enrich", enabled: true, configJson: JSON.stringify({ runOnCreate: true }) },
      { userId: user.id, name: "Auto-advance 'new' → 'contacted' after 24h", type: "auto_advance_status", enabled: true, configJson: JSON.stringify({ hours: 24, from: "new", to: "contacted" }) },
      { userId: user.id, name: "Create follow-up task 3 days after creation", type: "auto_followup_task", enabled: true, configJson: JSON.stringify({ days: 3 }) },
    ],
  });

  // Return user (without passwordHash)
  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
  });
}
