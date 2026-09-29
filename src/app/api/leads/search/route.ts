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
  // Niche
  leadType: "ecommerce" | "author";
  // Author-specific
  bookTitle: string | null;
  bookGenre: string | null;
  bookThemes: string[];
  bookHook: string | null;
  authorBio: string | null;
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
 * Body: { query, location?, industry?, leadType?: 'ecommerce'|'author', geminiKey? }
 *
 * For author leads:
 *  - search augmented with "author" + "book" terms
 *  - 4th Gemini call: extract author name, recent book title, themes, and a
 *    specific concrete "hook" from the book that can be referenced in outreach
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const query: string = body.query?.trim();
  const location: string = body.location?.trim() || "";
  const industry: string = body.industry?.trim() || "e-commerce";
  const leadType: "ecommerce" | "author" = body.leadType === "author" ? "author" : "ecommerce";
  const geminiKey: string = body.geminiKey || req.headers.get("x-gemini-key") || "";

  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  // Build a richer query
  const augmented = leadType === "author"
    ? [query, "author", "book", "novel", location].filter(Boolean).join(" ")
    : [query, industry, location].filter(Boolean).join(" ");

  const raw = await searchWeb(augmented, 12);

  // For author mode, KEEP goodreads.com and amazon.com (book listings)
  // but still block pure social sites.
  const blockedHosts = leadType === "author"
    ? [
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
        "glassdoor.com",
      ]
    : [
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
        "goodreads.com",
        "amazon.com",
        "amazon.co.uk",
      ];

  const cleaned: RawCandidate[] = raw
    .filter((r) => r && r.url && r.host_name)
    .filter((r) => !blockedHosts.some((b) => r.host_name.toLowerCase().includes(b)));

  const leads: DiscoveredLead[] = [];
  const TOP = cleaned.slice(0, 6);

  for (const item of TOP) {
    let email: string | null = null;
    let phone: string | null = null;
    let pageText = "";

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
      /* ignore page reader errors */
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
      industry: leadType === "author" ? "publishing" : industry,
      companySize: "",
      snippet: item.snippet?.slice(0, 280) || "",
      favicon: item.favicon || "",
      leadType,
    };

    // ------------------ Author branch ------------------
    if (leadType === "author") {
      // Author extraction prompt — pulls author name + recent book + themes + hook
      const authorPrompt = `You are a literary research assistant. From the page content below, extract the author's identity and their most recent or featured book.

Source URL: ${item.url}
Source snippet: ${item.snippet}
Page excerpt:
${pageText.slice(0, 3000)}

Return STRICT JSON only, no markdown fences:
{
  "authorName": string | null,
  "bookTitle": string | null,
  "bookGenre": string | null,
  "bookThemes": [string],
  "bookHook": string,  // a specific concrete detail from the book that can be referenced in outreach to catch the author's attention — a character name, opening line, distinctive plot device, signature theme, or stylistic choice. Must be specific enough to feel like the writer actually read the book.
  "authorBio": string | null  // one-sentence bio if available
}`;

      const validationPrompt = `Validate this as a real, contactable author lead (i.e. an actual published author with a website).

Author candidate: ${company}
URL: ${item.url}
Snippet: ${item.snippet}
Email found: ${email || "none"}

Return STRICT JSON only:
{ "valid": boolean, "confidence": number 0-100, "warnings": [string], "notes": string }`;

      const scorePrompt = `Score this author lead 0-100 for outreach by a publishing services provider (book PR, marketing, design, or rights services).

Author: ${company} — ${item.url}
Email present: ${!!email}

Return STRICT JSON only:
{ "score": number, "tier": "hot"|"warm"|"cold", "signals": [string], "rationale": string }`;

      const summaryPrompt = `Summarize this author lead and recommend an outreach angle that references their work.

Author: ${company} (${item.url})
Snippet: ${item.snippet}
Page excerpt: ${pageText.slice(0, 2000)}

Return STRICT JSON only:
{ "summary": string (2 sentences max), "angle": string (1-sentence pitch recommendation that should feel book-literate) }`;

      const [authorRes, validRes, scoreRes, summaryRes] = await Promise.all([
        callGemini(geminiKey, authorPrompt, "You are a literary research assistant. Always return strict JSON."),
        callGemini(geminiKey, validationPrompt, "You are a strict author-lead validator. Always return strict JSON."),
        callGemini(geminiKey, scorePrompt, "You are a strict lead scorer. Always return strict JSON."),
        callGemini(geminiKey, summaryPrompt, "You are a concise literary researcher. Always return strict JSON."),
      ]);

      let authorJson: any = {};
      let validJson: any = {};
      let scoreJson: any = {};
      let summaryJson: any = {};
      try { authorJson = JSON.parse(authorRes.text.replace(/```json|```/g, "").trim()); } catch { /* empty */ }
      try { validJson = JSON.parse(validRes.text.replace(/```json|```/g, "").trim()); } catch { /* empty */ }
      try { scoreJson = JSON.parse(scoreRes.text.replace(/```json|```/g, "").trim()); } catch { /* empty */ }
      try { summaryJson = JSON.parse(summaryRes.text.replace(/```json|```/g, "").trim()); } catch { /* empty */ }

      const authorName: string = authorJson.authorName || company;
      const bookTitle: string | null = authorJson.bookTitle || null;
      const bookGenre: string | null = authorJson.bookGenre || null;
      const bookThemes: string[] = Array.isArray(authorJson.bookThemes) ? authorJson.bookThemes : [];
      const bookHook: string | null = authorJson.bookHook || null;
      const authorBio: string | null = authorJson.authorBio || null;

      leads.push({
        ...leadBase,
        name: authorName,
        bookTitle,
        bookGenre,
        bookThemes,
        bookHook,
        authorBio,
        verified: validJson.valid !== false && (!!bookTitle || !!authorBio),
        score: typeof scoreJson.score === "number" ? scoreJson.score : Math.round((validJson.confidence || 50) * 0.7 + 30),
        summary: summaryJson.summary || authorBio || "",
        angle: summaryJson.angle || "",
        warnings: validJson.warnings || [],
        usedMock: authorRes.usedMock || validRes.usedMock || scoreRes.usedMock || summaryRes.usedMock,
        geminiError: authorRes.error || validRes.error || scoreRes.error || summaryRes.error,
      });
      continue;
    }

    // ------------------ E-commerce branch (original) ------------------
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
      bookTitle: null,
      bookGenre: null,
      bookThemes: [],
      bookHook: null,
      authorBio: null,
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
    leadType,
    total: leads.length,
    leads,
  });
}
