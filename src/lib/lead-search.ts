import ZAI from "z-ai-web-dev-sdk";

let zaiInstance: ZAI | null = null;

export async function getZAI(): Promise<ZAI> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

export interface RawSearchResult {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
  rank: number;
  date: string;
  favicon: string;
}

export async function searchWeb(query: string, num = 10): Promise<RawSearchResult[]> {
  try {
    const zai = await getZAI();
    const result = (await zai.functions.invoke("web_search", {
      query,
      num,
    })) as RawSearchResult[];
    return result || [];
  } catch (err) {
    console.error("web_search failed:", err);
    return [];
  }
}

export async function readPage(url: string): Promise<{ title: string; html: string; publishedTime?: string } | null> {
  try {
    const zai = await getZAI();
    const result = (await zai.functions.invoke("page_reader", { url })) as {
      code: number;
      data: { html: string; title: string; publishedTime?: string; url: string };
      status: number;
    };
    if (result?.data) {
      return {
        title: result.data.title,
        html: result.data.html,
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
