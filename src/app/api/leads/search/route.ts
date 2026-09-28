import { NextRequest, NextResponse } from "next/server";
import { searchWeb, readPage, stripHtml } from "@/lib/lead-search";
import { callGemini } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RawCandidate {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
  date?: string;
  favicon?: string;
}

interface DiscoveredLead {
  name: string;
  company: string;
  website: string;
  email: string | null;
  phone: string | null;
  location: string;
  industry: string;
  companySize: string;
  snippet: string;
  favicon: string;
  // Gemini confirmation fields (pre-show)
  verified: boolean;
  score: number;
  summary: string;
  angle: string;
  warnings: string[];
  usedMock: boolean;
  geminiError?: string;
}

function extractEmails(text: string): string[] {
  const re = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  return Array.from(new Set(text.match(re) || []));
}
function extractPhones(text: string): string[] {
  const re = /(\+?\d[\d\s\-().]{7,}\d)/g;
  return Array.from(new Set(text.match(re) || []));
}

/**
 * POST /api/leads/search
 * Body: { query: string, location?: string, industry?: string, geminiKey?: string }
 *
 * 1. Run web_search via z-ai-web-dev-sdk
 * 2. For each result, optionally read the page and extract email/phone
 * 3. Call Gemini to validate + score + summarize BEFORE returning to client
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const query: string = body.query?.trim();
  const location: string = body.location?.trim() || "";
  const industry: string = body.industry?.trim() || "e-commerce";
  const geminiKey: string = body.geminiKey || req.headers.get("x-gemini-key") || "";

  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  // Build a richer query: append location/industry if provided
  const augmented = [query, industry, location].filter(Boolean).join(" ");
  const raw = await searchWeb(augmented, 12);

  // Filter out obvious non-leads (linkedin, facebook, twitter, etc.)
  const blockedHosts = [
    "linkedin.com",
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "youtube.com",
    "tiktok.com",
    "pinterest.com",
    "wikipedia.org",
    "yelp.com",
    "trustpilot.com",
    "bloomberg.com",
    "crunchbase.com",
    "yelp.ca",
    "glassdoor.com",
  ];
  const cleaned: RawCandidate[] = raw
    .filter((r) => r && r.url && r.host_name)
    .filter((r) => !blockedHosts.some((b) => r.host_name.toLowerCase().includes(b)));

  const leads: DiscoveredLead[] = [];

  // Limit to 6 to keep response time reasonable
  const TOP = cleaned.slice(0, 6);

  for (const item of TOP) {
    let email: string | null = null;
    let phone: string | null = null;
    let pageText = "";

    // Try to read the actual page to extract contact info
    try {
      const page = await readPage(item.url);
      if (page) {
        pageText = stripHtml(page.html, 6000);
        const emails = extractEmails(pageText).filter(
          (e) => !e.endsWith(".png") && !e.endsWith(".jpg") && !e.endsWith(".gif")
        );
        if (emails.length > 0) email = emails[0];
        const phones = extractPhones(pageText);
        if (phones.length > 0) phone = phones[0];
      }
    } catch {
      // ignore page reader errors
    }

    // Build the lead object
    const company = item.host_name
      .replace(/^www\./, "")
      .replace(/\.[a-z]+$/i, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const leadBase = {
      name: company,
      company,
      website: item.url,
      email,
      phone,
      location,
      industry,
      companySize: "",
      snippet: item.snippet?.slice(0, 280) || "",
      favicon: item.favicon || "",
    };

    // Run Gemini confirmation pipeline
    const validationPrompt = `You are a lead-qualification assistant. Validate this lead as a real, contactable e-commerce/SMB business.

Lead data:
- Company: ${company}
- Website: ${item.url}
- Snippet: ${item.snippet}
- Email found: ${email || "none"}
- Page excerpt: ${pageText.slice(0, 1500)}

Return STRICT JSON only, no markdown fences:
{
  "valid": boolean,
  "confidence": number 0-100,
  "warnings": [string],
  "notes": string
}`;

    const scorePrompt = `Score this lead's quality for B2B outreach (services to e-commerce/SMB brands).

Lead: ${company} — ${item.url}
Snippet: ${item.snippet}
Email present: ${!!email}

Return STRICT JSON only:
{
  "score": number 0-100,
  "tier": "hot" | "warm" | "cold",
  "signals": [string],
  "rationale": string
}`;

    const summaryPrompt = `Summarize this lead and recommend an outreach angle.

Company: ${company} (${item.url})
Snippet: ${item.snippet}
Page excerpt: ${pageText.slice(0, 2000)}

Return STRICT JSON only:
{
  "summary": string (2 sentences max),
  "angle": string (recommended pitch angle in 1 sentence)
}`;

    const [validRes, scoreRes, summaryRes] = await Promise.all([
      callGemini(geminiKey, validationPrompt, "You are a strict B2B lead validator. Always return strict JSON."),
      callGemini(geminiKey, scorePrompt, "You are a strict lead scorer. Always return strict JSON."),
      callGemini(geminiKey, summaryPrompt, "You are a concise account researcher. Always return strict JSON."),
    ]);

    let validJson: any = {};
    let scoreJson: any = {};
    let summaryJson: any = {};
    try { validJson = JSON.parse(validRes.text.replace(/```json|```/g, "").trim()); } catch { /* empty */ }
    try { scoreJson = JSON.parse(scoreRes.text.replace(/```json|```/g, "").trim()); } catch { /* empty */ }
    try { summaryJson = JSON.parse(summaryRes.text.replace(/```json|```/g, "").trim()); } catch { /* empty */ }

    leads.push({
      ...leadBase,
      verified: validJson.valid !== false,
      score: typeof scoreJson.score === "number" ? scoreJson.score : Math.round((validJson.confidence || 50) * 0.7 + 30),
      summary: summaryJson.summary || "",
      angle: summaryJson.angle || "",
      warnings: validJson.warnings || [],
      usedMock: validRes.usedMock || scoreRes.usedMock || summaryRes.usedMock,
      geminiError: validRes.error || scoreRes.error || summaryRes.error,
    });
  }

  return NextResponse.json({
    query,
    total: leads.length,
    leads,
  });
}
