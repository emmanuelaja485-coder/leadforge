/**
 * Lead-search client — discovery + page-reading.
 *
 * ARCHITECTURE:
 * - searchWeb(): Uses Gemini's google_search tool for grounding. The model
 *   searches the web and returns URLs + descriptions. Works on Cloudflare
 *   (Gemini is reachable from edge) and on local dev.
 * - readPage(): Uses direct fetch() to grab the HTML of any URL. No external
 *   API dependency — Cloudflare Workers can fetch any URL.
 * - zaiChatCompletion(): Legacy ZAI chat fallback, only used by gemini.ts
 *   when Gemini is unavailable. Works on local dev where the ZAI session
 *   token is valid; no-ops on Cloudflare (the session token isn't valid
 *   from Cloudflare's IP).
 *
 * ENV VARS (set as Cloudflare secrets or in .env for local dev):
 *   ZAI_BASE_URL, ZAI_API_KEY, ZAI_CHAT_ID, ZAI_USER_ID, ZAI_TOKEN
 *
 * Gemini key is passed per-call via the geminiKey parameter (from the
 * `x-gemini-key` header set by the browser's Settings tab).
 */

import { getOptionalRequestContext } from "@cloudflare/next-on-pages";

// ---------------- ZAI Config (for the chat fallback only) ----------------

interface ZAIConfig {
  baseUrl: string;
  apiKey: string;
  chatId?: string;
  userId?: string;
  token?: string;
}

let cachedConfig: ZAIConfig | null = null;

function getZAIConfig(): ZAIConfig | null {
  if (cachedConfig) return cachedConfig;

  let envSource: Record<string, string | undefined> = {};
  try {
    const ctx = getOptionalRequestContext();
    if (ctx?.env) envSource = ctx.env as Record<string, string | undefined>;
  } catch {
    /* not on Cloudflare */
  }
  if (Object.keys(envSource).length === 0) {
    envSource = process.env as Record<string, string | undefined>;
  }

  const cfg: ZAIConfig = {
    baseUrl: envSource.ZAI_BASE_URL || process.env.ZAI_BASE_URL || "",
    apiKey: envSource.ZAI_API_KEY || process.env.ZAI_API_KEY || "",
    chatId: envSource.ZAI_CHAT_ID || process.env.ZAI_CHAT_ID || undefined,
    userId: envSource.ZAI_USER_ID || process.env.ZAI_USER_ID || undefined,
    token: envSource.ZAI_TOKEN || process.env.ZAI_TOKEN || undefined,
  };

  if (cfg.baseUrl && cfg.apiKey) {
    cachedConfig = cfg;
    return cfg;
  }
  return null;
}

function zaiHeaders(cfg: ZAIConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey}`,
    "X-Z-AI-From": "Z",
  };
  if (cfg.chatId) headers["X-Chat-Id"] = cfg.chatId;
  if (cfg.userId) headers["X-User-Id"] = cfg.userId;
  if (cfg.token) headers["X-Token"] = cfg.token;
  return headers;
}

// ---------------- Types ----------------

export interface RawSearchResult {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
  rank: number;
  date: string;
  favicon: string;
}

const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_ENDPOINT = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

// ---------------- searchWeb — uses Gemini google_search ----------------

/**
 * Search the web for lead candidates using Gemini's google_search tool.
 * Returns a list of { url, name, snippet, host_name, rank, date, favicon }.
 *
 * FALLBACK CHAIN:
 * 1. If geminiKey is provided → try Gemini's google_search tool (works on
 *    Cloudflare since Gemini is reachable from the edge)
 * 2. If Gemini fails (quota, network) OR no key → fall back to ZAI web_search
 *    (only works on local dev where ZAI session token is valid)
 * 3. If both fail → return []
 */
export async function searchWeb(
  query: string,
  num = 10,
  geminiKey?: string | null
): Promise<RawSearchResult[]> {
  // 1) Try Gemini google_search first
  if (geminiKey) {
    const geminiResults = await searchWebViaGemini(query, num, geminiKey);
    if (geminiResults.length > 0) return geminiResults;
    // else fall through to ZAI
  }

  // 2) Fall back to ZAI web_search (sandbox dev only — won't work on Cloudflare)
  const zaiResults = await searchWebViaZAI(query, num);
  if (zaiResults.length > 0) return zaiResults;

  // 3) Both failed
  return [];
}

async function searchWebViaGemini(
  query: string,
  num: number,
  geminiKey: string
): Promise<RawSearchResult[]> {
  try {
    const body: any = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Search the web for: ${query}

Find up to ${num} relevant websites. For each result, return JSON only (no markdown fences, no commentary), as an array of objects:

[{"url": "https://...", "name": "Page Title", "snippet": "1-2 sentence description of what this site does", "host_name": "example.com"}]

Rules:
- All URLs must be real, discoverable via Google Search
- Each entry must have a real url, name, snippet, and host_name
- host_name is the bare domain (strip https:// and paths)
- Prefer the most relevant results for the query
- Return ONLY the JSON array, nothing else`,
            },
          ],
        },
      ],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 4096 },
    };

    const resp = await fetch(GEMINI_ENDPOINT(geminiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("Gemini google_search HTTP error:", resp.status, errText.slice(0, 200));
      return [];
    }

    const data = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p: any) => p.text || "").join("\n").trim();

    const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!jsonMatch) {
      console.error("No JSON array found in Gemini response. Text:", text.slice(0, 300));
      return [];
    }

    let parsed: any[] = [];
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("Failed to parse Gemini JSON:", e);
      return [];
    }

    return parsed
      .filter((r) => r && r.url)
      .map((r, i) => ({
        url: r.url,
        name: r.name || r.title || r.url,
        snippet: r.snippet || r.description || "",
        host_name:
          r.host_name ||
          (() => {
            try {
              return new URL(r.url).hostname.replace(/^www\./, "");
            } catch {
              return r.url;
            }
          })(),
        rank: i,
        date: r.date || "",
        favicon: r.favicon || "",
      }));
  } catch (err) {
    console.error("searchWebViaGemini failed:", err);
    return [];
  }
}

async function searchWebViaZAI(query: string, num: number): Promise<RawSearchResult[]> {
  const cfg = getZAIConfig();
  if (!cfg) return [];

  try {
    const resp = await fetch(`${cfg.baseUrl}/functions/invoke`, {
      method: "POST",
      headers: zaiHeaders(cfg),
      body: JSON.stringify({
        function_name: "web_search",
        arguments: { query, num },
      }),
    });
    if (!resp.ok) {
      console.error("ZAI web_search HTTP error:", resp.status);
      return [];
    }
    const data = await resp.json();
    const result = data?.result ?? data ?? [];
    return Array.isArray(result) ? result : [];
  } catch (err) {
    console.error("searchWebViaZAI failed:", err);
    return [];
  }
}

// ---------------- readPage — direct fetch (no external API) ----------------

/**
 * Fetch a URL directly and return its HTML + title. Works on Cloudflare
 * (Workers can fetch any URL) and on local dev.
 *
 * If the URL blocks non-browser user agents, we send a realistic UA.
 */
export async function readPage(
  url: string
): Promise<{ title: string; html: string; publishedTime?: string } | null> {
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!resp.ok) {
      console.error(`readPage HTTP ${resp.status} for ${url}`);
      return null;
    }

    const html = await resp.text();
    if (!html) return null;

    // Extract <title>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // Try to extract publishedTime from meta tags
    let publishedTime: string | undefined;
    const metaMatch =
      html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+property=["']og:published_time["'][^>]+content=["']([^"']+)["']/i);
    if (metaMatch) publishedTime = metaMatch[1];

    return { title, html, publishedTime };
  } catch (err) {
    console.error("readPage failed:", err);
    return null;
  }
}

/**
 * Strip HTML to plain text and trim to a max length, used for page summaries.
 */
export function stripHtml(html: string, maxLen = 4000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

// ---------------- ZAI chat fallback (sandbox dev only) ----------------

/**
 * ZAI chat completions — used by gemini.ts as a fallback when Gemini is
 * unavailable (e.g. geo-blocked from sandbox HK region). Only works on
 * local dev where the session-bound ZAI token is valid. On Cloudflare,
 * this returns "" (ZAI rejects non-session IPs with 403 error 1002).
 */
export async function zaiChatCompletion(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const cfg = getZAIConfig();
  if (!cfg) return "";

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  try {
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: zaiHeaders(cfg),
      body: JSON.stringify({
        messages,
        thinking: { type: "disabled" },
      }),
    });
    if (!resp.ok) {
      console.error("ZAI chat HTTP error:", resp.status);
      return "";
    }
    const data: any = await resp.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    return typeof text === "string" ? text.trim() : String(text);
  } catch (err) {
    console.error("ZAI chat failed:", err);
    return "";
  }
}
