/**
 * Gemini API client — calls Google Generative Language API directly via fetch.
 * The user supplies their own API key through the settings UI; the key is
 * forwarded by the API routes via the `x-gemini-key` header.
 *
 * FALLBACK CHAIN:
 * 1. If a Gemini API key is set AND Gemini responds successfully → use Gemini
 * 2. If Gemini fails (e.g. geo-restriction — Gemini is blocked from some server
 *    regions like Hong Kong), automatically retry via the ZAI chat completions
 *    API (which works from any region and is pre-installed in this project).
 * 3. If no key is set, fall back to deterministic mock responses so the app
 *    remains demo-able end-to-end.
 *
 * The `usedFallback` flag in the response indicates when the ZAI fallback was
 * used so the UI can surface this to the user.
 */

import ZAI from "z-ai-web-dev-sdk";

const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_ENDPOINT = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

export interface GeminiResponse {
  text: string;
  usedMock: boolean;
  usedFallback?: boolean; // true when ZAI chat was used instead of Gemini
  error?: string;
}

let zaiInstance: ZAI | null = null;
async function getZAI(): Promise<ZAI> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

/**
 * Fallback: use ZAI's chat completions API when Gemini is unavailable.
 * ZAI is pre-configured via .z-ai-config and works in any region.
 */
async function callZAIChat(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  try {
    const zai = await getZAI();
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const completion: any = await zai.chat.completions.create({
      messages,
      thinking: { type: "disabled" },
    });

    const text = completion?.choices?.[0]?.message?.content ?? "";
    return typeof text === "string" ? text.trim() : String(text);
  } catch (err: any) {
    return "";
  }
}

export async function callGemini(
  apiKey: string | null | undefined,
  prompt: string,
  systemPrompt?: string
): Promise<GeminiResponse> {
  // No key → mock mode
  if (!apiKey) {
    return {
      text: mockResponseFor(prompt),
      usedMock: true,
    };
  }

  // Try Gemini first
  try {
    const body: any = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    };
    if (systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    const resp = await fetch(GEMINI_ENDPOINT(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (resp.ok) {
      const data = await resp.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("\n") ?? "";
      const trimmed = text.trim();
      if (trimmed) {
        return { text: trimmed, usedMock: false, usedFallback: false };
      }
    }

    // Gemini returned an error — try the ZAI fallback
    const errText = await resp.text().catch(() => "");
    const zaiText = await callZAIChat(prompt, systemPrompt);
    if (zaiText) {
      return {
        text: zaiText,
        usedMock: false,
        usedFallback: true,
        error: `Gemini unavailable (HTTP ${resp.status}), used ZAI fallback. ${errText.slice(0, 120)}`,
      };
    }
    return {
      text: "",
      usedMock: false,
      error: `Gemini API error ${resp.status}: ${errText.slice(0, 300)}`,
    };
  } catch (err: any) {
    // Network / runtime error — try the ZAI fallback
    const zaiText = await callZAIChat(prompt, systemPrompt);
    if (zaiText) {
      return {
        text: zaiText,
        usedMock: false,
        usedFallback: true,
        error: `Gemini network error, used ZAI fallback. ${err?.message || ""}`,
      };
    }
    return {
      text: "",
      usedMock: false,
      error: err?.message || String(err),
    };
  }
}

/**
 * Mock responses keep the app fully functional without a Gemini key.
 * Detects the prompt type by keyword and returns a plausible structured answer.
 *
 * IMPORTANT: message-type checks run BEFORE validation/scoring/summarization
 * checks because message prompts often contain words like "summary" or "angle"
 * as context, which would otherwise match the wrong template.
 */
function mockResponseFor(prompt: string): string {
  const p = prompt.toLowerCase();

  // 1) AUTHOR message templates — checked first. Match on stable instruction text
  //    that survives the {{placeholder}} fill step (placeholders are already replaced
  //    with real values by the time the prompt reaches callGemini).
  if (p.includes("first-touch cold email to the author")) {
    // Author cold email
    return "Subject: The bit in {{bookTitle}} where {{bookHook}}\n\nHi {{name}},\n\nI read {{bookTitle}} last week — the moment with {{bookHook}} genuinely stayed with me. Most debut {{bookGenre}} novels pull that punch; you didn't.\n\nI run book PR + targeted reader outreach for {{bookGenre}} authors and noticed {{bookThemes}} readers are an underserved audience for your work. I'd put together a free reader-targeting teardown if you're open to it?\n\n10-min call next week?\n\n— [Your name]";
  }
  if (p.includes("(connection request note + first message) to author")) {
    return "Hi {{name}} — {{bookHook}} in {{bookTitle}} knocked me sideways. Want to chat book PR? — [Your name]\n\nHi {{name}} — finished {{bookTitle}} yesterday. The {{bookHook}} bit — that's the line that made me message you. I help {{bookGenre}} authors find readers who'd actually feel that. Worth a quick chat? — [Your name]";
  }
  if (p.includes("follow-up email to author")) {
    return "Hi {{name}},\n\nBumping my note about {{bookTitle}}. I keep thinking about {{bookHook}} — most {{bookGenre}} books wouldn't risk that move. I built a small reader-targeting teardown that ties your themes to underserved audiences. 5-min look?\n\n— [Your name]";
  }
  if (p.includes("whatsapp/sms message to author")) {
    return "hey {{name}} — finished {{bookTitle}}. the {{bookHook}} bit wrecked me. built you a reader-targeting teardown. want it? — [your name]";
  }
  if (p.includes("pitch/proposal message to author")) {
    return "Proposal for {{name}} — re: {{bookTitle}}\n\nHi {{name}},\n\nThe {{bookHook}} in {{bookTitle}} is exactly the kind of detail that finds its readers — but right now those readers don't know the book exists.\n\nHere's what I'd do:\n1. Reader-targeting sprint — surface {{bookThemes}} communities already primed for your book. Projected reach: 5-15k niche readers in 30 days.\n2. Review pipeline — long-form reviews on the 6 sites that actually move {{bookGenre}} sales. Projected +30% review velocity.\n3. Pitch package — a 1-pager built around {{bookHook}} for media + bookstagrammers.\n\nScope: 4 weeks, fixed fee, no results no charge.\n\nPick a slot?\n\n— [Your name]";
  }

  // 2) E-COMMERCE message templates
  if (p.includes("first-touch cold email") || p.includes("subject line on the first line")) {
    return "Subject: Quick idea for {{company}}\n\nHi {{name}},\n\nNoticed {{company}}'s storefront and loved the product mix — especially the way the collection pages are organized. Most Shopify brands I work with in {{industry}} are leaking 10-15% of revenue to abandoned carts; a 2-line email flow usually recovers most of it inside 14 days.\n\nWorth a 10-minute look next week? Happy to send a free teardown first.\n\n— [Your name]";
  }
  if (p.includes("linkedin dm") || p.includes("connection request + first message")) {
    return "Hi {{name}} — saw {{company}}'s recent drop and the new collection. Genuinely impressed. Most DTC brands in {{industry}} are sitting on untapped cart-recovery revenue; I put together a free teardown for brands I like. Want me to send yours over? — [Your name]";
  }
  if (p.includes("polite follow-up email") || p.includes("didn't reply to your first message")) {
    return "Hi {{name}},\n\nBumping my note from last week on {{company}}. I made a quick 90-second teardown showing where the storefront is likely leaking revenue — no strings, happy to send the Loom. Worth it?\n\n— [Your name]";
  }
  if (p.includes("whatsapp/sms") || p.includes("under 160 characters total")) {
    return "Hey {{name}} — saw {{company}}, liked it. Made you a 90s teardown on where you're leaking revenue. Want it? - [Your name]";
  }
  if (p.includes("longer-form pitch") || p.includes("proposal for {{company}}")) {
    return "Proposal for {{company}}\n\nHi {{name}},\n\nBased on a quick audit of {{company}}, here's what I'd prioritize:\n\n1. Cart recovery automation — projected +8-12% revenue\n2. Product page CRO — projected +15% conversion\n3. Email flows rebuild — projected +5% LTV\n\nScope: 4 weeks, fixed fee, results guaranteed in writing.\n\nHappy to walk through the audit live. Pick a slot?\n\n— [Your name]";
  }

  // 3) Author extraction / validation / scoring / summary (author mode)
  if (p.includes("literary research assistant") && p.includes("authorname")) {
    return JSON.stringify({
      authorName: null,
      bookTitle: null,
      bookGenre: null,
      bookThemes: [],
      bookHook: "",
      authorBio: null,
    });
  }
  if (p.includes("validate this as a real, contactable author lead")) {
    return JSON.stringify({
      valid: true,
      confidence: 70,
      warnings: ["Author identity not confirmed without Gemini key — set API key in Settings."],
      notes: "Mock validation in demo mode.",
    });
  }
  if (p.includes("score this author lead")) {
    return JSON.stringify({
      score: 75,
      tier: "warm",
      signals: ["Author website active", "Genre keywords present"],
      rationale: "Author shows publishing-relevant signals but book extraction requires real Gemini.",
    });
  }
  if (p.includes("summarize this author lead")) {
    return JSON.stringify({
      summary: "Published author with active web presence; book extraction requires Gemini API key.",
      angle: "Reference their most recent book and a specific concrete detail from it.",
    });
  }

  // 4) E-commerce validation / scoring / summary
  if (p.includes("validate this lead") || (p.includes("validate") && p.includes("lead"))) {
    return JSON.stringify({
      valid: true,
      confidence: 72,
      warnings: ["Email pattern inferred from domain — verify before sending."],
      notes: "Domain resolves and appears active. No public spam blacklist hits.",
    });
  }
  if (p.includes("score this lead") || (p.includes("score") && p.includes("b2b outreach"))) {
    return JSON.stringify({
      score: 78,
      tier: "warm",
      signals: ["Active website", "E-commerce footprint", "Mid-market size"],
      rationale: "Lead shows e-commerce signals consistent with target ICP.",
    });
  }
  if (p.includes("summarize this lead") || (p.includes("summar") && p.includes("outreach angle"))) {
    return JSON.stringify({
      summary: "DTC e-commerce brand running on Shopify, mid-market revenue, active social presence.",
      angle: "Pitch conversion-rate optimization + abandoned-cart automation as quick wins.",
    });
  }

  return "Mock response — set your Gemini API key in Settings to enable real AI generation.";
}
