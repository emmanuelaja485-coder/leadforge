import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/app/api/auth/me/route";
import { callGemini } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/leads/[id]/messages
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const messages = await (await db).message.findMany({
    where: { leadId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ messages });
}

// ---------- E-commerce message templates ----------
const ECOM_LABELS: Record<string, { label: string; instructions: string }> = {
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

// ---------- Author-specific templates — all reference the book concretely ----------
const AUTHOR_LABELS: Record<string, { label: string; instructions: string }> = {
  cold_email: {
    label: "Author Cold Email",
    instructions: `Write a first-touch cold email to the author {{name}} about their book "{{bookTitle}}".

Author context:
- Website: {{website}}
- Genre: {{bookGenre}}
- Themes: {{bookThemes}}
- Specific hook to reference: {{bookHook}}
- Author bio: {{authorBio}}
- Pitch angle: {{angle}}

CRITICAL RULES (this is the most important part):
- The first sentence MUST reference the specific hook above (a character name, opening line, plot device, theme, or stylistic choice) in a way that makes clear you actually read the book. Be specific — not generic flattery.
- DO NOT say "I loved your book" or "your writing is amazing" — those feel like mass mail. Instead, name something concrete from the book.
- Subject line on first line, prefixed "Subject: ".
- 120-180 words.
- Connect the hook to the service you're offering ({{angle}}) in 1-2 sentences.
- Single soft CTA: a 10-min call or a free sample of work.
- Sign off "[Your name]".
- Plain text only, no markdown.`,
  },
  linkedin: {
    label: "LinkedIn DM",
    instructions: `Write a LinkedIn DM (connection request note + first message) to author {{name}} about their book "{{bookTitle}}".

Author context:
- Website: {{website}}
- Genre: {{bookGenre}}
- Specific hook to reference: {{bookHook}}
- Pitch angle: {{angle}}

RULES:
- Connection request note: 1 line, max 200 chars, MUST name a specific detail from the book (the hook above).
- Blank line.
- First message: max 300 chars, conversational, follow up on that detail with one concrete observation, end with a soft question.
- Sign "[Your name]".
- Plain text only.`,
  },
  followup: {
    label: "Follow-up #1",
    instructions: `Write a polite follow-up email to author {{name}} about their book "{{bookTitle}}".

Context: They didn't reply to your first message about {{angle}}. The hook you previously referenced was: {{bookHook}}.

Rules:
- 80-120 words.
- Reference your previous note AND add ONE new specific observation about the book (a different angle on the same hook, or a related theme).
- Low-pressure CTA: "Worth a 5-min look?".
- Sign "[Your name]".
- Plain text only.`,
  },
  whatsapp: {
    label: "WhatsApp / SMS",
    instructions: `Write a WhatsApp/SMS message to author {{name}} about their book "{{bookTitle}}".

Specific hook to reference: {{bookHook}}
Angle: {{angle}}

Rules:
- Under 200 characters total.
- Conversational, lowercase-friendly.
- Reference the specific hook concretely (e.g. "the bit where [specific detail]" or "the way [specific thing]").
- One clear question.
- Sign "[Your name]".
- Plain text only.`,
  },
  pitch: {
    label: "Pitch / Proposal",
    instructions: `Write a longer-form pitch/proposal message to author {{name}} about their book "{{bookTitle}}".

Author context:
- Website: {{website}}
- Genre: {{bookGenre}}
- Themes: {{bookThemes}}
- Specific hook: {{bookHook}}
- Angle: {{angle}}

Rules:
- Title line: "Proposal for {{name}} — re: {{bookTitle}}".
- Opening: 1-2 sentences that reference the specific hook concretely (show you read the book).
- Then 3 numbered priorities for what you'd do for them, each tied to the book's specific themes/content (not generic).
- A scope line: "Scope: 4 weeks, fixed fee, no results no charge."
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
  const TEMPLATES = body.authorMode ? AUTHOR_LABELS : ECOM_LABELS;
  if (!TEMPLATES[type]) {
    return NextResponse.json({ error: "unknown message type" }, { status: 400 });
  }
  const geminiKey = req.headers.get("x-gemini-key") || body.geminiKey || "";

  const lead = await (await db).lead.findUnique({ where: { id, userId: (await getCurrentUser(_req || req))?.id || "" } });
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isAuthor = lead.leadType === "author" || body.authorMode;
  const template = isAuthor ? AUTHOR_LABELS[type] : ECOM_LABELS[type];

  // Parse book themes from JSON if present
  let bookThemesStr = "";
  try {
    const themes = lead.bookThemes ? JSON.parse(lead.bookThemes) : [];
    if (Array.isArray(themes)) bookThemesStr = themes.join(", ");
  } catch { /* ignore */ }

  const fill = (s: string) =>
    s
      .replaceAll("{{name}}", lead.name || "there")
      .replaceAll("{{company}}", lead.company || lead.name || "your company")
      .replaceAll("{{website}}", lead.website || "")
      .replaceAll("{{industry}}", lead.industry || "e-commerce")
      .replaceAll("{{angle}}", lead.geminiAngle || (isAuthor ? "Book PR + targeted reader outreach" : "Quick-win CRO + abandoned-cart automation"))
      .replaceAll("{{bookTitle}}", lead.bookTitle || "your most recent book")
      .replaceAll("{{bookGenre}}", lead.bookGenre || "literary fiction")
      .replaceAll("{{bookThemes}}", bookThemesStr || "identity, longing, and quiet redemption")
      .replaceAll("{{bookHook}}", lead.bookHook || "the way the protagonist's voice fractures in the second act")
      .replaceAll("{{authorBio}}", lead.authorBio || "");

  const instructions = fill(template.instructions);

  // Build rich lead-context block for the prompt
  const leadContext = isAuthor
    ? `Author context:
- Name: ${lead.name}
- Website: ${lead.website || "(unknown)"}
- Book: ${lead.bookTitle || "(unknown)"}
- Genre: ${lead.bookGenre || "(unknown)"}
- Themes: ${bookThemesStr || "(none extracted)"}
- Specific hook to reference: ${lead.bookHook || "(no specific hook extracted — pick a concrete detail based on themes)"}
- Author bio: ${lead.authorBio || "(none)"}
- Recommended angle: ${lead.geminiAngle || "Book PR + targeted reader outreach"}`
    : `Lead context:
- Company: ${lead.company || lead.name}
- Website: ${lead.website || "(unknown)"}
- Industry: ${lead.industry || "e-commerce"}
- Recommended angle: ${lead.geminiAngle || "CRO + cart recovery"}
- Lead summary: ${lead.geminiSummary || "(no summary yet)"}`;

  const prompt = `${instructions}\n\n${leadContext}`;

  const sys = isAuthor
    ? "You are a senior publishing-industry outreach copywriter. You write to authors in a way that proves you actually read their book. You NEVER send generic flattery — you always reference a specific concrete detail from the book. Never invent the sender's name — use '[Your name]' as the signoff."
    : "You are a senior B2B outreach copywriter. Write personalized, non-spammy messages. Always replace placeholders. Never invent real names for the sender — use '[Your name]' as the signoff.";

  const res = await callGemini(geminiKey, prompt, sys);

  if (res.error && !res.text) {
    return NextResponse.json({ error: res.error }, { status: 500 });
  }

  // Fill remaining placeholders (mostly relevant for mock responses)
  let content = res.text;
  if (res.usedMock) {
    content = fill(content);
  }

  const message = await (await db).message.create({
    data: { leadId: id, type, content },
  });

  await (await db).lead.update({
    where: { id },
    data: { lastContactedAt: new Date(), status: lead.status === "new" ? "contacted" : lead.status },
  });

  await (await db).automationLog.create({
    data: { leadId: id, action: "message_generated", detail: `Generated ${template.label} via Gemini.` },
  });

  return NextResponse.json({ message, usedMock: res.usedMock, usedFallback: res.usedFallback });
}
