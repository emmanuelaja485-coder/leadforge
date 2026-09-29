import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// GET /api/leads/[id]
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const lead = await (await db).lead.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "desc" } }, tasks: { orderBy: { createdAt: "desc" } } },
  });
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ lead });
}

// PATCH /api/leads/[id] — update status, lastContactedAt, etc.
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = await req.json();
  const data: any = {};
  if (body.status) data.status = body.status;
  if (typeof body.score === "number") data.score = body.score;
  if (body.geminiVerified !== undefined) data.geminiVerified = body.geminiVerified;
  if (body.geminiSummary !== undefined) data.geminiSummary = body.geminiSummary;
  if (body.geminiAngle !== undefined) data.geminiAngle = body.geminiAngle;
  if (body.geminiWarnings !== undefined) data.geminiWarnings = body.geminiWarnings;
  if (body.portfolioJson !== undefined) data.portfolioJson = body.portfolioJson;
  if (body.lastContactedAt !== undefined) data.lastContactedAt = body.lastContactedAt;
  if (body.location !== undefined) data.location = body.location;
  if (body.industry !== undefined) data.industry = body.industry;
  if (body.companySize !== undefined) data.companySize = body.companySize;
  if (body.email !== undefined) data.email = body.email;
  if (body.phone !== undefined) data.phone = body.phone;
  if (body.notes !== undefined) data.snippet = body.notes;

  const lead = await (await db).lead.update({ where: { id }, data });
  return NextResponse.json({ lead });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  await (await db).lead.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
