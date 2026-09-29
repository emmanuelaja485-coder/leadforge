import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/leads/[id]/tasks
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const tasks = await (await db).task.findMany({
    where: { leadId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ tasks });
}

// POST /api/leads/[id]/tasks  body: { title, type, dueDate? }
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = await req.json();
  const { title, type, dueDate } = body || {};
  if (!title || !type) {
    return NextResponse.json({ error: "title and type required" }, { status: 400 });
  }
  const task = await (await db).task.create({
    data: {
      leadId: id,
      title,
      type,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });
  return NextResponse.json({ task });
}

// PATCH /api/leads/[id]/tasks  body: { id, completed?, title?, dueDate? }
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = await req.json();
  const data: any = {};
  if (typeof body.completed === "boolean") data.completed = body.completed;
  if (body.title !== undefined) data.title = body.title;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;

  const task = await (await db).task.update({ where: { id: body.id || id }, data });
  return NextResponse.json({ task });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const taskId = url.searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });
  await (await db).task.delete({ where: { id: taskId } });
  return NextResponse.json({ ok: true });
}
