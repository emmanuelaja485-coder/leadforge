import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/automation/run
 * Executes all enabled automation rules:
 * - auto_advance_status: leads in `from` status older than X hours → `to` status
 * - auto_followup_task: leads without an active follow-up task older than X days → create one
 * Returns counts of actions taken.
 */
export async function POST() {
  const rules = await (await db).automationRule.findMany({ where: { enabled: true } });

  let advanced = 0;
  let tasksCreated = 0;
  const log: string[] = [];

  for (const rule of rules) {
    let cfg: any = {};
    try { cfg = JSON.parse(rule.configJson || "{}"); } catch { /* ignore */ }

    if (rule.type === "auto_advance_status") {
      const hours = cfg.hours || 24;
      const from = cfg.from || "new";
      const to = cfg.to || "contacted";
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      const stale = await (await db).lead.findMany({
        where: { status: from, createdAt: { lt: cutoff } },
      });
      for (const lead of stale) {
        await (await db).lead.update({ where: { id: lead.id }, data: { status: to } });
        await (await db).automationLog.create({
          data: { ruleId: rule.id, leadId: lead.id, action: "auto_advance_status", detail: `${from} → ${to} after ${hours}h` },
        });
        advanced++;
      }
      log.push(`Advanced ${stale.length} leads from ${from} → ${to}`);
    }

    if (rule.type === "auto_followup_task") {
      const days = cfg.days || 3;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const leadsNeedingTask = await (await db).lead.findMany({
        where: {
          createdAt: { lt: cutoff },
          tasks: { none: { type: "followup", completed: false } },
        },
      });
      for (const lead of leadsNeedingTask) {
        const due = new Date();
        due.setDate(due.getDate() + 2);
        await (await db).task.create({
          data: { leadId: lead.id, title: `Follow up with ${lead.name}`, type: "followup", dueDate: due },
        });
        await (await db).automationLog.create({
          data: { ruleId: rule.id, leadId: lead.id, action: "auto_followup_task", detail: `Created follow-up task for ${lead.name}` },
        });
        tasksCreated++;
      }
      log.push(`Created ${leadsNeedingTask.length} follow-up tasks`);
    }
  }

  return NextResponse.json({ advanced, tasksCreated, log });
}
