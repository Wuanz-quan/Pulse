// ── SHARED NEWSAPI CONFIG/HELPERS ───────────────────────────────
// Used by googleAPI.js (topic feeds) and article.js (related articles)
// so the API key + base request logic only lives in one place.

// Get a free key at https://newsapi.org → Sign Up
export const NEWS_KEY =
  new URLSearchParams(location.search).get("key") ||
  "501f9811a7b74a4db6b56ed1985cf2ba";

export const TOPIC_MAP = {
  top: { label: "Tin Nổi Bật", q: null, category: "general" },
  technology: { label: "Công Nghệ", q: "technology", category: "technology" },
  science: { label: "Khoa Học", q: "science", category: "science" },
  business: { label: "Kinh Doanh", q: "business", category: "business" },
  sports: { label: "Thể Thao", q: "sports", category: "sports" },
  entertainment: {
    label: "Giải Trí",
    q: "entertainment",
    category: "entertainment",
  },
  health: { label: "Sức Khỏe", q: "health", category: "health" },
};

export async function fetchNews(topic, pageSize = 7) {
  const cfg = TOPIC_MAP[topic];

  const params = new URLSearchParams({
    apiKey: NEWS_KEY,
    language: "en",
    pageSize: String(pageSize),
  });

  let url;
  if (cfg.category && !cfg.q) {
    // Top headlines by category
    params.set("category", cfg.category);
    params.set("country", "us");
    url = `https://newsapi.org/v2/top-headlines?${params}`;
  } else {
    // Everything by keyword
    params.set("q", cfg.q);
    params.set("sortBy", "publishedAt");
    url = `https://newsapi.org/v2/everything?${params}`;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`NewsAPI error: ${res.status}`);
  const data = await res.json();
  if (data.status === "error") throw new Error(data.message);
  return data.articles || [];
}

// ── SEARCH ────────────────────────────────────────────────────
// Free-text search across NewsAPI's /v2/everything, used by the nav
// search bar. Separate from fetchRelatedArticles below (that one derives
// its own keywords from an article; this one takes the user's raw query).
export async function searchNews(query, pageSize = 20) {
  const params = new URLSearchParams({
    apiKey: NEWS_KEY,
    language: "en",
    sortBy: "relevancy",
    pageSize: String(pageSize),
    q: query,
  });

  const url = `https://newsapi.org/v2/everything?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NewsAPI error: ${res.status}`);
  const data = await res.json();
  if (data.status === "error") throw new Error(data.message);
  return data.articles || [];
}

// ── RELATED ARTICLES ────────────────────────────────────────────
// NewsAPI has no built-in "related to this article" endpoint, so we
// derive a keyword query from the article's own title/description and
// search /v2/everything with it — effectively an ad-hoc similarity
// search based on shared vocabulary.

const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","of","to","in","on","for","with",
  "at","by","from","up","about","into","over","after","is","are","was",
  "were","be","been","being","it","its","this","that","these","those",
  "as","not","no","so","than","then","too","very","can","will","just",
  "how","what","when","where","why","who","which","its","their","his",
  "her","he","she","they","we","you","your","our","new","says","say",
  "said","after","before","amid","vs","us","have","has","had","more",
  "most","some","all","one","two","first","latest","news","report",
  "reports","week","today","year",
]);

// Pulls the most distinctive words out of a title/description — longer,
// non-stopword tokens (which tend to be proper nouns / specific topics)
// ranked above short common ones, deduplicated, capped to a handful so
// the resulting query stays specific instead of matching everything.
function extractKeywords(article) {
  const text = [article.title, article.description]
    .filter(Boolean)
    .join(" ");

  const seen = new Set();
  const words = [];
  for (const raw of text.split(/[^A-Za-z0-9'-]+/)) {
    const w = raw.trim();
    if (w.length < 4) continue;
    const lower = w.toLowerCase();
    if (STOPWORDS.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    words.push(w);
  }

  // Favor longer / capitalized (likely proper-noun) words first.
  words.sort((a, b) => {
    const aCap = /^[A-Z]/.test(a) ? 1 : 0;
    const bCap = /^[A-Z]/.test(b) ? 1 : 0;
    if (aCap !== bCap) return bCap - aCap;
    return b.length - a.length;
  });

  return words.slice(0, 6);
}

// Fetches candidate related articles for `article`, excluding the
// article itself, and returns up to `limit` results.
export async function fetchRelatedArticles(article, limit = 4) {
  const keywords = extractKeywords(article);
  if (!keywords.length) return [];

  const params = new URLSearchParams({
    apiKey: NEWS_KEY,
    language: "en",
    sortBy: "relevancy",
    pageSize: 20,
    q: keywords.join(" OR "),
  });

  const url = `https://newsapi.org/v2/everything?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NewsAPI error: ${res.status}`);
  const data = await res.json();
  if (data.status === "error") throw new Error(data.message);

  const candidates = data.articles || [];
  const seenUrls = new Set([article.url].filter(Boolean));
  const seenTitles = new Set(
    [article.title].filter(Boolean).map((t) => t.toLowerCase()),
  );

  const related = [];
  for (const a of candidates) {
    if (!a.title || a.title === "[Removed]") continue;
    if (a.url && seenUrls.has(a.url)) continue;
    const titleKey = a.title.toLowerCase();
    if (seenTitles.has(titleKey)) continue;
    seenUrls.add(a.url);
    seenTitles.add(titleKey);
    related.push(a);
    if (related.length >= limit) break;
  }
  return related;
}
