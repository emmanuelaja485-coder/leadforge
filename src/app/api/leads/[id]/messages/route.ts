import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callGemini } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/leads/[id]/messages
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const messages = await db.message.findMany({
    where: { leadId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ messages });
}

const TYPE_LABELS: Record<string, { label: string; instructions: string }> = {
  cold_email: {
    label: "Cold Email Intro",
    instructions: `Write a first-touch cold email to {{name}} at {{company}} ({{website}}).
Industry: {{industry}}. Angle: {{angle}}.

Rules:
- Subject line on the first line, prefixed "Subject: ".
- Body: 100-150 words, friendly but business-respectful.
- Lead with one specific observation about their brand/site (use the angle).
- One clear CTA: 10-min call or free teardown.
- Sign off with "[Your name]" — never invent a real name.
- Plain text only, no markdown.`,
  },
  linkedin: {
    label: "LinkedIn DM",
    instructions: `Write a LinkedIn DM (connection request + first message) to {{name}} at {{company}} ({{website}}).
Industry: {{industry}}. Angle: {{angle}}.

Rules:
- First line: a 1-line connection note (max 200 chars).
- Blank line.
- Then the first message (max 300 chars), conversational, no hard sell.
- Sign with "[Your name]".
- Plain text only.`,
  },
  followup: {
    label: "Follow-up #1",
    instructions: `Write a polite follow-up email to {{name}} at {{company}}.
Context: They didn't reply to your first message about {{angle}}.
Rules:
- 80-100 words.
- Reference the previous message and add ONE new value-props or insight.
- Low-pressure CTA: "Worth a 5-min look?".
- Sign "[Your name]".
- Plain text only.`,
  },
  whatsapp: {
    label: "WhatsApp / SMS",
    instructions: `Write a WhatsApp/SMS message to {{name}} at {{company}}.
Industry: {{industry}}. Angle: {{angle}}.
Rules:
- Under 160 characters total.
- Conversational, lowercase-friendly.
- One clear question.
- Sign "[Your name]".
- Plain text only.`,
  },
  pitch: {
    label: "Pitch / Proposal",
    instructions: `Write a longer-form pitch/proposal message to {{name}} at {{company}} ({{website}}).
Industry: {{industry}}. Angle: {{angle}}.
Rules:
- Title line "Proposal for {{company}}".
- 3 numbered priorities, each with a projected impact.
- A scope line: "Scope: 4 weeks, fixed fee, results guaranteed in writing."
- CTA: "Pick a slot?".
- Sign "[Your name]".
- Plain text only, no markdown fences.`,
  },
};

// POST /api/leads/[id]/messages  body: { type: 'cold_email'|'linkedin'|'followup'|'whatsapp'|'pitch' }
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = await req.json();
  const type: string = body.type;
  if (!TYPE_LABELS[type]) {
    return NextResponse.json({ error: "unknown message type" }, { status: 400 });
  }
  const geminiKey = req.headers.get("x-gemini-key") || body.geminiKey || "";

  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  const template = TYPE_LABELS[type];
  const fill = (s: string) =>
    s
      .replaceAll("{{name}}", lead.name || "there")
      .replaceAll("{{company}}", lead.company || lead.name || "your company")
      .replaceAll("{{website}}", lead.website || "")
      .replaceAll("{{industry}}", lead.industry || "e-commerce")
      .replaceAll("{{angle}}", lead.geminiAngle || "Quick-win CRO + abandoned-cart automation");

  const instructions = fill(template.instructions);
  const prompt = `${instructions}\n\nLead context:\n- Company: ${lead.company || lead.name}\n- Website: ${lead.website || "(unknown)"}\n- Industry: ${lead.industry || "e-commerce"}\n- Recommended angle: ${lead.geminiAngle || "CRO + cart recovery"}\n- Lead summary: ${lead.geminiSummary || "(no summary yet)"}`;

  const sys =
    "You are a senior B2B outreach copywriter. Write personalized, non-spammy messages. Always replace placeholders. Never invent real names for the sender — use '[Your name]' as the signoff.";
  const res = await callGemini(geminiKey, prompt, sys);

  if (res.error && !res.text) {
    return NextResponse.json({ error: res.error }, { status: 500 });
  }

  // Fill remaining placeholders (mostly relevant for mock responses)
  let content = res.text;
  if (res.usedMock) {
    content = content
      .replaceAll("{{name}}", lead.name || "there")
      .replaceAll("{{company}}", lead.company || lead.name || "your company")
      .replaceAll("{{website}}", lead.website || "")
      .replaceAll("{{industry}}", lead.industry || "e-commerce")
      .replaceAll("{{angle}}", lead.geminiAngle || "Quick-win CRO + abandoned-cart automation");
  }

  const message = await db.message.create({
    data: { leadId: id, type, content },
  });

  await db.lead.update({
    where: { id },
    data: { lastContactedAt: new Date(), status: lead.status === "new" ? "contacted" : lead.status },
  });

  await db.automationLog.create({
    data: { leadId: id, action: "message_generated", detail: `Generated ${template.label} via Gemini.` },
  });

  return NextResponse.json({ message, usedMock: res.usedMock });
}
