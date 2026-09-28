import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callGemini } from "@/lib/gemini";
import { readPage, stripHtml } from "@/lib/lead-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Portfolio {
  website: string;
  siteTitle: string;
  description: string;
  emails: string[];
  phones: string[];
  socials: { type: string; url: string }[];
  companyInfo: { founded?: string; teamSize?: string; keywords: string[] };
  projects: { title: string; url: string }[];
}

function extractAll(pattern: RegExp, text: string): string[] {
  return Array.from(new Set(text.match(pattern) || []));
}

function detectSocials(text: string): { type: string; url: string }[] {
  const socials: { type: string; url: string }[] = [];
  const patterns: Record<string, RegExp> = {
    linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/[^\s"'<>]+/gi,
    instagram: /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>]+/gi,
    facebook: /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>]+/gi,
    twitter: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^\s"'<>]+/gi,
    youtube: /https?:\/\/(?:www\.)?youtube\.com\/[^\s"'<>]+/gi,
    tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/[^\s"'<>]+/gi,
    dribbble: /https?:\/\/(?:www\.)?dribbble\.com\/[^\s"'<>]+/gi,
    behance: /https?:\/\/(?:www\.)?behance\.net\/[^\s"'<>]+/gi,
    pinterest: /https?:\/\/(?:www\.)?pinterest\.com\/[^\s"'<>]+/gi,
  };
  for (const [type, re] of Object.entries(patterns)) {
    const matches = text.match(re) || [];
    for (const url of matches.slice(0, 1)) socials.push({ type, url });
  }
  return socials;
}

function extractProjects(html: string, baseUrl: string): { title: string; url: string }[] {
  const out: { title: string; url: string }[] = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
  let m: RegExpExecArray | null;
  const base = new URL(baseUrl);
  while ((m = re.exec(html)) && out.length < 6) {
    let href = m[1];
    const text = m[2].replace(/&amp;/g, "&").trim();
    if (!text || text.length < 3 || text.length > 60) continue;
    if (href.startsWith("/")) href = base.origin + href;
    else if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    else if (!href.startsWith(base.origin)) continue;
    if (/(portfolio|projects|work|case|collections?|products?|services?)/i.test(href) || /portfolio|projects?|work|case/i.test(text)) {
      out.push({ title: text, url: href });
    }
  }
  return out;
}

/**
 * POST /api/leads/[id]/enrich
 * - Fetch lead's website via page_reader
 * - Extract emails, phones, socials, projects
 * - Run Gemini summary + angle + validation
 * - Save results to the lead record
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  const geminiKey =
    req.headers.get("x-gemini-key") || (await req.json().catch(() => ({}))).geminiKey || "";

  if (!lead.website) {
    return NextResponse.json({ error: "lead has no website to enrich" }, { status: 400 });
  }

  // 1. Read the lead's website
  const page = await readPage(lead.website);
  const portfolio: Portfolio = {
    website: lead.website,
    siteTitle: page?.title || lead.company || lead.name,
    description: "",
    emails: [],
    phones: [],
    socials: [],
    companyInfo: { keywords: [] },
    projects: [],
  };

  if (page) {
    const text = stripHtml(page.html, 8000);
    portfolio.description = text.slice(0, 600);
    portfolio.emails = extractAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g, text).filter(
      (e) => !/\.(png|jpg|gif|webp|svg)$/i.test(e)
    );
    portfolio.phones = extractAll(/(\+?\d[\d\s\-().]{7,}\d)/g, text);
    portfolio.socials = detectSocials(page.html);
    portfolio.companyInfo.keywords = Array.from(
      new Set(
        (text
          .toLowerCase()
          .match(/\b(shopify|woocommerce|ecommerce|saas|agency|fashion|beverage|cosmetics|fitness|tech|retail|wholesale|b2b|d2c|subscription|apparel|jewelry|home|food|wellness)\b/g) || [])
      )
    ).slice(0, 8);
    portfolio.projects = extractProjects(page.html, lead.website);
  }

  // 2. Run Gemini: validate + score + summarize using portfolio data
  const validationPrompt = `Validate this lead based on portfolio data.

Lead: ${lead.name} — ${lead.website}
Emails found: ${portfolio.emails.join(", ") || "none"}
Site title: ${portfolio.siteTitle}
Description excerpt: ${portfolio.description.slice(0, 800)}
Socials: ${portfolio.socials.map((s) => `${s.type}:${s.url}`).join(", ") || "none"}

Return STRICT JSON only:
{ "valid": boolean, "confidence": number 0-100, "warnings": [string], "notes": string }`;

  const scorePrompt = `Score this lead 0-100 for B2B outreach potential to a services provider (marketing/dev/CRO services for e-commerce brands).

Lead: ${lead.name} — ${lead.website}
Email present: ${portfolio.emails.length > 0}
Socials present: ${portfolio.socials.length}
Industry keywords: ${portfolio.companyInfo.keywords.join(", ")}

Return STRICT JSON only:
{ "score": number, "tier": "hot"|"warm"|"cold", "signals": [string], "rationale": string }`;

  const summaryPrompt = `Summarize this lead's portfolio and recommend an outreach angle.

Lead: ${lead.name} — ${lead.website}
Description: ${portfolio.description.slice(0, 1000)}
Keywords: ${portfolio.companyInfo.keywords.join(", ")}

Return STRICT JSON only:
{ "summary": string (2 sentences), "angle": string (1 sentence pitch recommendation) }`;

  const [validRes, scoreRes, summaryRes] = await Promise.all([
    callGemini(geminiKey, validationPrompt, "You are a strict B2B lead validator. Return strict JSON only."),
    callGemini(geminiKey, scorePrompt, "You are a strict lead scorer. Return strict JSON only."),
    callGemini(geminiKey, summaryPrompt, "You are a concise account researcher. Return strict JSON only."),
  ]);

  let validJson: any = {};
  let scoreJson: any = {};
  let summaryJson: any = {};
  try { validJson = JSON.parse(validRes.text.replace(/```json|```/g, "").trim()); } catch { /* empty */ }
  try { scoreJson = JSON.parse(scoreRes.text.replace(/```json|```/g, "").trim()); } catch { /* empty */ }
  try { summaryJson = JSON.parse(summaryRes.text.replace(/```json|```/g, "").trim()); } catch { /* empty */ }

  const updated = await db.lead.update({
    where: { id },
    data: {
      geminiVerified: validJson.valid !== false,
      geminiSummary: summaryJson.summary || lead.geminiSummary,
      geminiAngle: summaryJson.angle || lead.geminiAngle,
      geminiWarnings: validJson.warnings ? JSON.stringify(validJson.warnings) : lead.geminiWarnings,
      score: typeof scoreJson.score === "number" ? scoreJson.score : lead.score,
      email: lead.email || portfolio.emails[0] || null,
      phone: lead.phone || portfolio.phones[0] || null,
      portfolioJson: JSON.stringify(portfolio),
    },
    include: { messages: true, tasks: true },
  });

  await db.automationLog.create({
    data: { leadId: id, action: "auto_enrich", detail: "Enriched lead portfolio + Gemini validation." },
  });

  return NextResponse.json({
    lead: updated,
    portfolio,
    gemini: {
      valid: validJson,
      score: scoreJson,
      summary: summaryJson,
      usedMock: validRes.usedMock || scoreRes.usedMock || summaryRes.usedMock,
      error: validRes.error || scoreRes.error || summaryRes.error,
    },
  });
}
