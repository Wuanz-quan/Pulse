// ── SHARED AI SUMMARIZATION ENGINE (Google Gemini — free tier only) ──
// Used by googleAPI.js (card summaries), article.js (article page), and
// notes.js (saved notes). Everything about *how* we talk to Gemini lives
// here — structured output, grounding, caching, and free-quota fallback —
// so an accuracy fix in one place fixes all three surfaces instead of
// three copies quietly drifting apart.
//
// Design goals for this module specifically:
//   1. ACCURATE  — structured JSON output instead of free-form prose, an
//      explicit "not enough information" escape hatch so the model isn't
//      forced to pad with invented detail, and a post-hoc numeric
//      grounding check against the source text.
//   2. FREE      — Gemini Developer API free tier only, no billing, no
//      paid fallback. gemini-2.0-flash is deliberately NOT in the model
//      chain below: Google retired it in March 2026.
//   3. MANY USES — a two-model free-tier fallback chain (see MODEL_CHAIN)
//      plus a local cache so the same content is never re-billed against
//      the daily quota twice. Together these make the free quota go a
//      lot further per day.

export const GEMINI_KEY_STORAGE = "pulse_gemini_key";

// Full Flash first (better reasoning, fewer missed nuances), then drop to
// Flash-Lite if Flash's free-tier quota is hit. Flash-Lite is a lighter
// model, but it's still free, and its free-tier RPM/RPD ceiling is
// several times more generous than full Flash's — so one busy model no
// longer means "no summary today," it means a quick, quiet downgrade.
const MODEL_CHAIN = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

const CACHE_PREFIX = "pulse_summary_cache_v2:";
const CACHE_INDEX_KEY = "pulse_summary_cache_index_v2";
const CACHE_MAX_ENTRIES = 250;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    key_points: { type: "ARRAY", items: { type: "STRING" } },
    topics: { type: "ARRAY", items: { type: "STRING" } },
    insufficient_info: { type: "BOOLEAN" },
  },
  required: ["summary", "key_points", "insufficient_info"],
};

export function getGeminiKey() {
  return localStorage.getItem(GEMINI_KEY_STORAGE) || "";
}
export function setGeminiKey(key) {
  localStorage.setItem(GEMINI_KEY_STORAGE, key.trim());
}

// ── Cheap content hash (djb2) for cache keys ─────────────────────
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function cacheKey(kind, sourceText) {
  return `${CACHE_PREFIX}${kind}:${hashString(sourceText)}`;
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...value, ts: Date.now() }));
    let index = [];
    try {
      index = JSON.parse(localStorage.getItem(CACHE_INDEX_KEY)) || [];
    } catch {
      index = [];
    }
    index = index.filter((k) => k !== key);
    index.push(key);
    // Evict oldest entries once the cache grows past its cap, so
    // localStorage doesn't grow unbounded over months of use.
    while (index.length > CACHE_MAX_ENTRIES) {
      const evicted = index.shift();
      localStorage.removeItem(evicted);
    }
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  } catch {
    // Cache is best-effort; a full/blocked localStorage shouldn't break
    // summarization itself.
  }
}

// ── Networking ────────────────────────────────────────────────
// Calls one model and, on a transient 429, waits briefly and retries a
// couple times before giving up on that model (the caller then tries the
// next model in MODEL_CHAIN).
async function fetchGeminiWithRetry(model, apiKey, body, retries = 2) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status !== 429 || attempt >= retries) return response;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
}

// Gemini's 429 body tells you *which* quota you hit and, for the
// per-minute one, exactly how long to wait (RetryInfo.retryDelay). The
// daily quota has no countdown — it only resets at midnight Pacific.
async function parseRateLimitInfo(response) {
  try {
    const data = await response.json();
    const message = data?.error?.message || "";
    const details = data?.error?.details || [];
    const quotaFailure = details.find((d) =>
      d["@type"]?.includes("QuotaFailure"),
    );
    const retryInfo = details.find((d) => d["@type"]?.includes("RetryInfo"));
    const quotaId =
      quotaFailure?.violations?.[0]?.quotaId ||
      quotaFailure?.violations?.[0]?.quotaMetric ||
      "";
    const isDaily = /perday/i.test(quotaId) || /per day/i.test(message);
    let retrySeconds = null;
    const match = /^(\d+(?:\.\d+)?)s$/.exec(retryInfo?.retryDelay || "");
    if (match) retrySeconds = Math.ceil(parseFloat(match[1]));
    return { isDaily, retrySeconds };
  } catch {
    return { isDaily: false, retrySeconds: null };
  }
}

// ── Prompting ────────────────────────────────────────────────
function buildPrompt(kind, ctx) {
  const common =
    "CHỈ sử dụng thông tin có trong văn bản được cung cấp. TUYỆT ĐỐI không suy đoán, " +
    "không bịa thêm chi tiết, số liệu, tên riêng, hay diễn biến không có trong văn bản. " +
    "Nếu văn bản quá ngắn hoặc thiếu thông tin để tóm tắt có ý nghĩa, hãy đặt " +
    '"insufficient_info": true và chỉ nêu những gì thực sự có, thay vì suy diễn thêm cho đủ ý. ' +
    "Trả lời DUY NHẤT một object JSON đúng schema đã cho, không kèm lời giải thích, " +
    "không dùng markdown code fence.";

  if (kind === "note") {
    return (
      `Tóm tắt ghi chú sau bằng tiếng Việt trong 1-2 câu ngắn gọn, giữ đúng ý chính. ` +
      `Nếu có, liệt kê tối đa 2 việc cần làm hoặc ý chính dạng gạch đầu dòng ngắn vào key_points ` +
      `(để trống mảng nếu ghi chú không có ý phụ đáng tách ra). Để topics là mảng rỗng. ` +
      common +
      `\n\nSchema: {"summary": string, "key_points": string[], "topics": string[], "insufficient_info": boolean}` +
      `\n\nGhi chú:\n${ctx.text}`
    );
  }

  // kind === "article"
  const meta = [
    ctx.sourceName ? `Nguồn: ${ctx.sourceName}` : "",
    ctx.publishedAt ? `Ngày đăng: ${ctx.publishedAt}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    `Tóm tắt bài báo sau bằng tiếng Việt trong 3-4 câu, nêu đầy đủ ý chính. ` +
    `Đồng thời liệt kê 2-4 ý/số liệu cụ thể quan trọng nhất vào key_points, mỗi ý một câu ngắn, ` +
    `và 2-3 chủ đề/thẻ ngắn (1-3 từ) liên quan vào topics. ` +
    (ctx.truncated
      ? "Lưu ý: nội dung bài báo bên dưới bị cắt ngắn và không đầy đủ — chỉ tóm tắt phần thực sự có, đừng đoán phần còn thiếu. "
      : "") +
    common +
    `\n\nSchema: {"summary": string, "key_points": string[], "topics": string[], "insufficient_info": boolean}` +
    (meta ? `\n\n${meta}` : "") +
    `\n\nBài báo:\n${ctx.source}`
  );
}

// ── Post-hoc grounding check ─────────────────────────────────
// Cheap, no extra API call: pull every 2+ digit number (years, percents,
// counts, prices) out of the generated summary/key_points and confirm
// each one actually appears in the source text. Gemini is good at
// staying on-topic but still occasionally drifts on exact figures —
// this catches that class of error without spending more quota on a
// second verification call.
function checkGrounding(result, sourceText) {
  const numbers = new Set();
  const collect = (s) => {
    const matches = (s || "").match(/\d{2,}/g);
    if (matches) matches.forEach((n) => numbers.add(n));
  };
  collect(result.summary);
  (result.key_points || []).forEach(collect);
  if (numbers.size === 0) return false;
  for (const n of numbers) {
    if (!sourceText.includes(n)) return true; // found an unsupported figure
  }
  return false;
}

// Repairs a summary that was cut off mid-sentence (token ceiling hit
// before the model reached a sentence boundary): back up to the last
// complete sentence rather than showing a hanging fragment.
function trimToCleanSentence(summary) {
  const endsCleanly = /[.!?…"]\s*$/.test(summary);
  if (endsCleanly) return summary;
  const lastBreak = Math.max(
    summary.lastIndexOf(". "),
    summary.lastIndexOf("! "),
    summary.lastIndexOf("? "),
    summary.lastIndexOf(".\n"),
  );
  if (lastBreak > summary.length * 0.4) {
    return summary.slice(0, lastBreak + 1).trim();
  }
  return summary;
}

// Best-effort recovery if maxOutputTokens cut the JSON off mid-stream:
// pull whatever "summary" text is present rather than failing outright.
function parseModelJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = /"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
    if (m) {
      try {
        return { summary: JSON.parse(`"${m[1]}"`), key_points: [], topics: [] };
      } catch {
        return { summary: m[1], key_points: [], topics: [] };
      }
    }
    return null;
  }
}

async function callModel(model, apiKey, promptText, maxOutputTokens) {
  const response = await fetchGeminiWithRetry(model, apiKey, {
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      // Disabling "thinking" puts the whole token budget toward the
      // visible JSON output instead of burning part of it on hidden
      // reasoning tokens — that was the earlier cause of summaries (and
      // now JSON) getting cut off mid-way.
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });
  return response;
}

/**
 * Summarize an article or a note.
 * @param {"article"|"note"} kind
 * @param {object} ctx - for "article": { source, truncated, sourceName, publishedAt, cacheText }
 *                        for "note": { text }
 * @returns {Promise<{summary, keyPoints, topics, insufficientInfo, possiblyUngrounded, cached, model}>}
 */
export async function summarize(kind, ctx) {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("NO_KEY");

  const cacheText = kind === "note" ? ctx.text : ctx.cacheText || ctx.source;
  const key = cacheKey(kind, cacheText);
  const cached = readCache(key);
  if (cached) return { ...cached, cached: true };

  const promptText = buildPrompt(kind, ctx);
  const maxOutputTokens = kind === "note" ? 400 : 900;
  const sourceForGrounding = kind === "note" ? ctx.text : ctx.source;

  let lastErr = null;
  for (const model of MODEL_CHAIN) {
    let response;
    try {
      response = await callModel(model, apiKey, promptText, maxOutputTokens);
    } catch (e) {
      lastErr = new Error("API_ERROR");
      continue;
    }

    if (!response.ok) {
      if (response.status === 400 || response.status === 403) {
        throw new Error("BAD_KEY"); // auth issue, no point trying other models
      }
      if (response.status === 429) {
        const info = await parseRateLimitInfo(response);
        lastErr = new Error("RATE_LIMIT");
        lastErr.isDaily = info.isDaily;
        lastErr.retrySeconds = info.retrySeconds;
        continue; // try the next, roomier model
      }
      lastErr = new Error("API_ERROR");
      continue;
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text?.trim();
    if (!rawText) {
      lastErr = new Error("API_ERROR");
      continue;
    }

    const parsed = parseModelJson(rawText);
    if (!parsed || !parsed.summary) {
      lastErr = new Error("API_ERROR");
      continue;
    }

    const summary = trimToCleanSentence(parsed.summary.trim());
    const keyPoints = Array.isArray(parsed.key_points)
      ? parsed.key_points.filter(Boolean).slice(0, 4)
      : [];
    const topics = Array.isArray(parsed.topics)
      ? parsed.topics.filter(Boolean).slice(0, 3)
      : [];
    const insufficientInfo = !!parsed.insufficient_info;
    const possiblyUngrounded = checkGrounding(
      { summary, key_points: keyPoints },
      sourceForGrounding,
    );

    const result = {
      summary,
      keyPoints,
      topics,
      insufficientInfo,
      possiblyUngrounded,
      model,
    };
    writeCache(key, result);
    return { ...result, cached: false };
  }

  throw lastErr || new Error("API_ERROR");
}

// ── Rate-limit countdown UI helper (shared across all three surfaces) ──
// Gemini's free tier resets its per-minute request quota on a rolling
// 60s window. This counts down next to the error so people know
// roughly when it's worth clicking again. Only meaningful for the
// per-minute limit — daily-limit errors get a different message.
export function clearRateLimitCountdown(el) {
  if (el._rateLimitTimer) {
    clearInterval(el._rateLimitTimer);
    el._rateLimitTimer = null;
  }
}

export function startRateLimitCountdown(el, seconds) {
  clearRateLimitCountdown(el);
  let remaining = seconds || 60;
  const render = () => {
    el.textContent = `Đã vượt giới hạn Gemini API. Thử lại sau ${remaining}s.`;
  };
  render();
  el._rateLimitTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearRateLimitCountdown(el);
      el.textContent = "Có thể đã hết giới hạn — thử tóm tắt lại xem sao.";
      return;
    }
    render();
  }, 1000);
}

// ── Shared rendering for the richer summary payload ─────────────
// All three surfaces now get the same structured result (summary + key
// points + topics), so they share one render function instead of each
// re-inventing the markup.
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function renderSummaryHTML(result) {
  if (result.insufficientInfo) {
    return (
      `<div class="ai-summary-text"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px"><path d="M8 1c0 3.5 1 5 4.5 5-3.5 0-4.5 1.5-4.5 5 0-3.5-1-5-4.5-5C7 6 8 4.5 8 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg> ${escapeHtml(result.summary)}</div>` +
      `<div class="ai-summary-note">Nội dung nguồn quá ngắn để tóm tắt đầy đủ hơn.</div>`
    );
  }

  const pointsHtml = result.keyPoints?.length
    ? `<ul class="ai-summary-points">${result.keyPoints
        .map((p) => `<li>${escapeHtml(p)}</li>`)
        .join("")}</ul>`
    : "";
  const topicsHtml = result.topics?.length
    ? `<div class="ai-summary-topics">${result.topics
        .map((t) => `<span class="ai-summary-tag">${escapeHtml(t)}</span>`)
        .join("")}</div>`
    : "";
  const warnHtml = result.possiblyUngrounded
    ? `<div class="ai-summary-warn"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px"><path d="M8 2L1 14h14L8 2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 6.5v3.5M8 12h.01" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> Một vài số liệu có thể chưa khớp hoàn toàn với nguồn — kiểm tra lại ở bài gốc nếu cần.</div>`
    : "";

  return (
    `<div class="ai-summary-text"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px"><path d="M8 1c0 3.5 1 5 4.5 5-3.5 0-4.5 1.5-4.5 5 0-3.5-1-5-4.5-5C7 6 8 4.5 8 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg> ${escapeHtml(result.summary)}</div>` +
    pointsHtml +
    topicsHtml +
    warnHtml
  );
}
