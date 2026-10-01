/**
 * Author Discovery — Wikipedia + Open Library (NO Gemini, NO Brave)
 * ----------------------------------------------------------------
 * For author leads, we go DIRECTLY to authoritative book databases.
 * No web search needed. No AI verification needed.
 * Authors found here are real, verified, published authors.
 *
 * Sources (all free, no API key needed):
 *   1. Wikipedia API — curated author pages
 *   2. Open Library — structured author + book data
 */

export interface AuthorLead {
  name: string;
  website: string;
  email: string | null;
  phone: string | null;
  location: string;
  industry: string;
  companySize: string;
  snippet: string;
  favicon: string;
  leadType: "author";
  bookTitle: string | null;
  bookGenre: string | null;
  bookThemes: string[];
  bookHook: string | null;
  authorBio: string | null;
  verified: boolean;
  score: number;
  summary: string;
  angle: string;
  warnings: string[];
  usedMock: boolean;
  usedFallback?: boolean;
  geminiError?: string;
}

const AUTHOR_KEYWORDS =
  /writer|author|novelist|journalist|essayist|historian|biographer|poet|critic|columnist|blogger|editor|correspondent|playwright|screenwriter|memoirist|narratologist/i;

// ---------------- Wikipedia ----------------

async function fetchWikipediaAuthors(query: string): Promise<AuthorLead[]> {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query + " writer author"
  )}&srlimit=15&format=json&origin=*`;

  try {
    const searchResp = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "LeadForge/1.0 (https://leadforge.example.com; contact@example.com)",
      },
    });
    if (!searchResp.ok) return [];

    const searchData = await searchResp.json();
    const searchResults: any[] = searchData?.query?.search || [];

    const leads: AuthorLead[] = [];

    for (const result of searchResults.slice(0, 8)) {
      const title = result.title;
      try {
        const summaryResp = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
            title.replace(/ /g, "_")
          )}`,
          {
            headers: {
              "User-Agent":
                "LeadForge/1.0 (https://leadforge.example.com; contact@example.com)",
            },
          }
        );
        if (!summaryResp.ok) continue;

        const summary = await summaryResp.json();

        // Only include real people (not books, films, or concepts)
        if (summary.type !== "standard" || !summary.description) continue;
        if (!AUTHOR_KEYWORDS.test(summary.description)) continue;

        const extract: string = summary.extract || "";
        const description: string = summary.description || "";

        // Try to find a book title in the extract
        const bookMatch =
          extract.match(/\u201c([^\u201c\u201d]{3,80})\u201d/) ||
          extract.match(/"([^"]{3,80})"/);
        const bookTitle = bookMatch?.[1] || null;

        // Score based on data richness — Wikipedia pages are authoritative
        let score = 75;
        if (bookTitle) score += 10;
        if (summary.thumbnail) score += 5;
        if (/award|bestseller|prize|pulitzer|nobel/i.test(extract)) score += 10;

        const wikiUrl =
          summary.content_urls?.desktop?.page ||
          `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;

        leads.push({
          name: title,
          website: wikiUrl,
          email: null,
          phone: null,
          location: "",
          industry: "publishing",
          companySize: "",
          snippet: extract.slice(0, 280),
          favicon: summary.thumbnail?.source || "",
          leadType: "author",
          bookTitle,
          bookGenre: null,
          bookThemes: [],
          bookHook: bookTitle,
          authorBio: description,
          verified: true, // Wikipedia page = verified author
          score: Math.min(score, 95),
          summary: `${title} — ${description}. ${extract.slice(0, 200)}${
            extract.length > 200 ? "..." : ""
          }`,
          angle: bookTitle
            ? `Reference their Wikipedia biography and the work "${bookTitle}". Ask about their perspective on ${query}.`
            : `Reference their Wikipedia biography and contributions to ${query}. Ask about their current writing project.`,
          warnings: [],
          usedMock: false,
          usedFallback: false,
        });

        // Polite delay to Wikipedia
        await new Promise((r) => setTimeout(r, 100));
      } catch {
        continue;
      }
    }

    return leads;
  } catch (err) {
    console.error("Wikipedia fetch failed:", err);
    return [];
  }
}

// ---------------- Open Library ----------------

async function fetchOpenLibraryAuthors(query: string): Promise<AuthorLead[]> {
  const url = `https://openlibrary.org/search.json?subject=${encodeURIComponent(
    query
  )}&limit=20&fields=key,name,subject,top_work,top_work_count,work_count,author_name,author_key,title,first_publish_year,author_work_count`;

  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "LeadForge/1.0 (https://leadforge.example.com; contact@example.com)",
      },
    });
    if (!resp.ok) return [];

    const data = await resp.json();
    const docs: any[] = data?.docs || [];
    const leads: AuthorLead[] = [];
    const seen = new Set<string>();

    for (const doc of docs.slice(0, 12)) {
      if (!doc.author_name || doc.author_name.length === 0) continue;

      const authorName: string = doc.author_name[0];
      if (seen.has(authorName.toLowerCase())) continue;
      seen.add(authorName.toLowerCase());

      const authorKey: string | undefined = doc.author_key?.[0];
      const bookTitle: string | null = doc.title || null;
      const bookYear: number | undefined = doc.first_publish_year;
      const workCount: number =
        doc.author_work_count || doc.work_count || 0;

      let score = 50;
      if (workCount > 5) score += 15;
      if (workCount > 20) score += 10;
      if (bookYear && bookYear >= 2020) score += 15;
      if (bookYear && bookYear >= 2023) score += 10;

      const authorUrl = authorKey
        ? `https://openlibrary.org/authors/${authorKey}`
        : `https://openlibrary.org/search?author=${encodeURIComponent(
            authorName
          )}`;

      leads.push({
        name: authorName,
        website: authorUrl,
        email: null,
        phone: null,
        location: "",
        industry: "publishing",
        companySize: "",
        snippet: `${authorName} has ${workCount}+ works in Open Library${
          bookTitle
            ? `; notable: "${bookTitle}"${
                bookYear ? ` (${bookYear})` : ""
              }`
            : ""
        }.`,
        favicon: "",
        leadType: "author",
        bookTitle,
        bookGenre: null,
        bookThemes: [],
        bookHook: bookTitle,
        authorBio: `Author with ${workCount}+ works in Open Library.`,
        verified: true, // Open Library = verified published author
        score: Math.min(score, 92),
        summary: `${authorName} has ${workCount}+ works in Open Library${
          bookTitle
            ? `; notable: "${bookTitle}"${
                bookYear ? ` (${bookYear})` : ""
              }`
            : ""
        }.`,
        angle: bookTitle
          ? `Reference their work "${bookTitle}"${
              bookYear ? ` published in ${bookYear}` : ""
            } and ask about their writing process for ${query}.`
          : `Reference their body of work in ${query} and ask about their current project.`,
        warnings: [],
        usedMock: false,
        usedFallback: false,
      });
    }

    return leads;
  } catch (err) {
    console.error("Open Library fetch failed:", err);
    return [];
  }
}

// ---------------- Main: discover authors (no Gemini) ----------------

/**
 * Discover real author leads via Wikipedia + Open Library.
 * No API keys needed. No Gemini. No Brave. Real verified authors only.
 */
export async function discoverAuthors(
  query: string,
  location?: string
): Promise<AuthorLead[]> {
  console.log("[discoverAuthors] query:", query);

  const [wikiLeads, olLeads] = await Promise.all([
    fetchWikipediaAuthors(query),
    fetchOpenLibraryAuthors(query),
  ]);

  console.log(
    `[discoverAuthors] Wikipedia: ${wikiLeads.length} | Open Library: ${olLeads.length}`
  );

  // Merge + dedupe by name
  const seen = new Set<string>();
  const all = [...wikiLeads, ...olLeads].filter((lead) => {
    const key = lead.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by score desc
  all.sort((a, b) => b.score - a.score);

  // Take top 6
  const top = all.slice(0, 6);

  // If location provided, set it on all leads
  if (location) {
    top.forEach((lead) => (lead.location = location));
  }

  console.log(`[discoverAuthors] returning ${top.length} verified leads`);
  return top;
}
