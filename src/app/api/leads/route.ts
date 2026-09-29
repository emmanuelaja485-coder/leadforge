import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/leads — list leads with filters
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "";
  const location = url.searchParams.get("location") || "";
  const industry = url.searchParams.get("industry") || "";
  const companySize = url.searchParams.get("companySize") || "";
  const minScore = parseInt(url.searchParams.get("minScore") || "0", 10);
  const search = url.searchParams.get("q") || "";
  const leadType = url.searchParams.get("leadType") || "";

  const where: any = {};
  if (status && status !== "all") where.status = status;
  if (location) where.location = { contains: location };
  if (industry) where.industry = { contains: industry };
  if (companySize) where.companySize = companySize;
  if (minScore > 0) where.score = { gte: minScore };
  if (leadType && leadType !== "all") where.leadType = leadType;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { company: { contains: search } },
      { email: { contains: search } },
      { website: { contains: search } },
      { bookTitle: { contains: search } },
    ];
  }

  const leads = await (await db).lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return NextResponse.json({ leads });
}

// POST /api/leads — create lead manually (or save a confirmed discovery)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    name,
    company,
    email,
    phone,
    website,
    location,
    industry,
    companySize,
    snippet,
    score,
    geminiSummary,
    geminiAngle,
    geminiWarnings,
    geminiVerified,
    portfolioJson,
    status,
    leadType,
    bookTitle,
    bookGenre,
    bookThemes,
    bookHook,
    authorBio,
  } = body || {};

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Dedupe by website or email
  const existing = await (await db).lead.findFirst({
    where: {
      OR: [
        ...(website ? [{ website }] : []),
        ...(email ? [{ email }] : []),
      ],
    },
  });
  if (existing) {
    return NextResponse.json({ lead: existing, duplicate: true });
  }

  const lead = await (await db).lead.create({
    data: {
      name,
      company: company || null,
      email: email || null,
      phone: phone || null,
      website: website || null,
      location: location || null,
      industry: industry || null,
      companySize: companySize || null,
      snippet: snippet || null,
      score: typeof score === "number" ? score : 0,
      geminiSummary: geminiSummary || null,
      geminiAngle: geminiAngle || null,
      geminiWarnings: geminiWarnings || null,
      geminiVerified: geminiVerified || false,
      portfolioJson: portfolioJson || null,
      status: status || "new",
      leadType: leadType || "ecommerce",
      bookTitle: bookTitle || null,
      bookGenre: bookGenre || null,
      bookThemes: bookThemes ? (typeof bookThemes === "string" ? bookThemes : JSON.stringify(bookThemes)) : null,
      bookHook: bookHook || null,
      authorBio: authorBio || null,
    },
  });

  // Auto-create follow-up task (automation rule)
  const due = new Date();
  due.setDate(due.getDate() + 3);
  await (await db).task.create({
    data: {
      leadId: lead.id,
      title: `Follow up with ${lead.name}`,
      type: "followup",
      dueDate: due,
    },
  });

  await (await db).automationLog.create({
    data: {
      leadId: lead.id,
      action: "auto_followup_task",
      detail: "Created default follow-up task 3 days after lead creation.",
    },
  });

  return NextResponse.json({ lead });
}
