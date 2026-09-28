import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/automation/rules
export async function GET() {
  // Seed default rules if none exist
  let rules = await db.automationRule.findMany();
  if (rules.length === 0) {
    const defaults = [
      { name: "Auto-enrich new leads", type: "auto_enrich", enabled: true, configJson: JSON.stringify({ runOnCreate: true }) },
      { name: "Auto-advance 'new' → 'contacted' after 24h", type: "auto_advance_status", enabled: true, configJson: JSON.stringify({ hours: 24, from: "new", to: "contacted" }) },
      { name: "Create follow-up task 3 days after creation", type: "auto_followup_task", enabled: true, configJson: JSON.stringify({ days: 3 }) },
    ];
    rules = await Promise.all(defaults.map((d) => db.automationRule.create({ data: d })));
  }
  const logs = await db.automationLog.findMany({
    take: 20,
    orderBy: { createdAt: "desc" },
    include: { lead: true },
  });
  return NextResponse.json({ rules, logs });
}

// PATCH /api/automation/rules  body: { id, enabled }
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, enabled } = body;
  const rule = await db.automationRule.update({
    where: { id },
    data: { enabled: !!enabled },
  });
  return NextResponse.json({ rule });
}
