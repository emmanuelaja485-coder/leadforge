/**
 * ZAI HTTP API client — calls ZAI's REST endpoints directly via fetch.
 *
 * Config comes from environment variables (set as Cloudflare secrets via
 * `wrangler pages secret put`, or in .env for local dev):
 *   ZAI_BASE_URL, ZAI_API_KEY, ZAI_CHAT_ID, ZAI_USER_ID, ZAI_TOKEN
 *
 * On Cloudflare: env vars come from `getOptionalRequestContext().env`
 * On local dev:  env vars come from `process.env` (set in .env)
 *
 * This replaces the z-ai-web-dev-sdk wrapper that was here before, because
 * the SDK reads its config from a file at runtime — which doesn't work on
 * Cloudflare's edge runtime (no fs module).
 */

import { getOptionalRequestContext } from "@cloudflare/next-on-pages";

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

  // On Cloudflare, env vars/secrets are exposed on the request context's env object
  let envSource: Record<string, string | undefined> = {};
  try {
    const ctx = getOptionalRequestContext();
    if (ctx?.env) {
      envSource = ctx.env as Record<string, string | undefined>;
    }
  } catch {
    // Not on Cloudflare — fall through to process.env
  }
  // Fall back to process.env for local dev
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

// ---------------- Public API ----------------

export async function searchWeb(query: string, num = 10): Promise<RawSearchResult[]> {
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
      console.error("web_search HTTP error:", resp.status, await resp.text().catch(() => ""));
      return [];
    }
    const data = await resp.json();
    const result = data?.result ?? data ?? [];
    return Array.isArray(result) ? result : [];
  } catch (err) {
    console.error("web_search failed:", err);
    return [];
  }
}

export async function readPage(
  url: string
): Promise<{ title: string; html: string; publishedTime?: string } | null> {
  const cfg = getZAIConfig();
  if (!cfg) return null;

  try {
    const resp = await fetch(`${cfg.baseUrl}/functions/invoke`, {
      method: "POST",
      headers: zaiHeaders(cfg),
      body: JSON.stringify({
        function_name: "page_reader",
        arguments: { url },
      }),
    });
    if (!resp.ok) {
      console.error("page_reader HTTP error:", resp.status, await resp.text().catch(() => ""));
      return null;
    }
    const data = await resp.json();
    const result = data?.result ?? data ?? null;
    if (result?.data) {
      return {
        title: result.data.title || "",
        html: result.data.html || "",
        publishedTime: result.data.publishedTime,
      };
    }
    return null;
  } catch (err) {
    console.error("page_reader failed:", err);
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

// ---------------- Chat completions (used by gemini.ts fallback) ----------------

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
      console.error("ZAI chat HTTP error:", resp.status, await resp.text().catch(() => ""));
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

