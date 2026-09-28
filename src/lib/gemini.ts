/**
 * Gemini API client — calls Google Generative Language API directly via fetch.
 * The user supplies their own API key through the settings UI; the key is
 * forwarded by the API routes via the `x-gemini-key` header.
 *
 * If no key is provided, all calls fall back to a deterministic mock so the
 * app remains demo-able end-to-end.
 */

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

export interface GeminiResponse {
  text: string;
  usedMock: boolean;
  error?: string;
}

export async function callGemini(
  apiKey: string | null | undefined,
  prompt: string,
  systemPrompt?: string
): Promise<GeminiResponse> {
  if (!apiKey) {
    return {
      text: mockResponseFor(prompt),
      usedMock: true,
    };
  }

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

    if (!resp.ok) {
      const errText = await resp.text();
      return {
        text: "",
        usedMock: false,
        error: `Gemini API error ${resp.status}: ${errText.slice(0, 300)}`,
      };
    }

    const data = await resp.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("\n") ?? "";
    return { text: text.trim(), usedMock: false };
  } catch (err: any) {
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

  // 1) Message templates — match on the writer-instruction keywords first.
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

  // 2) Lead validation / scoring / summarization prompts.
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
