// ── ARTICLE DETAIL PAGE ─────────────────────────────────────────
// Renders whichever article the user clicked on the home page. The
// article object is handed off via sessionStorage (set by googleAPI.js
// right before navigating here) since there's no backend to look
// articles up by id.
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getGeminiKey,
  summarize,
  clearRateLimitCountdown,
  startRateLimitCountdown,
  renderSummaryHTML,
} from "./summarizer.js";
import { fetchRelatedArticles } from "./newsapi.js";

const ARTICLE_STORAGE_KEY = "pulse_selected_article";

let currentUser = null;
let currentArticle = null;

function isPremiumUser() {
  return (
    !!currentUser &&
    localStorage.getItem(`pulse_premium_${currentUser.uid}`) === "active"
  );
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  updateSummarizeButtonState();
  refreshRelatedSection();
});

window.addEventListener("pulse:premium-changed", () => {
  updateSummarizeButtonState();
  refreshRelatedSection();
});

function updateSummarizeButtonState() {
  const btn = document.getElementById("article-summarize");
  if (!btn || btn.dataset.state === "loading" || btn.dataset.state === "done")
    return;
  const premium = isPremiumUser();
  btn.classList.toggle("card-summarize-locked", !premium);
  btn.innerHTML = premium ? `Tóm tắt bằng AI` : "Tóm tắt bằng AI (Premium)";
}

// Request/response handling, caching, model fallback, and grounding
// checks now live in summarizer.js.

async function handleSummarizeClick(btn) {
  const summaryBox = document.getElementById("article-summary");
  clearRateLimitCountdown(summaryBox);

  if (!isPremiumUser()) {
    summaryBox.innerHTML = `Tóm tắt bằng AI là tính năng dành cho gói Premium. <a href="premium.html">Nâng cấp ngay</a> để mở khóa.`;
    summaryBox.classList.remove("hidden", "card-summary-error");
    summaryBox.classList.add("card-summary-locked");
    return;
  }

  if (!getGeminiKey()) {
    alert(
      "Vui lòng mở mục Ghi Chú và thêm Gemini API key trong phần cài đặt trước khi dùng tính năng tóm tắt.",
    );
    return;
  }

  btn.dataset.state = "loading";
  btn.disabled = true;
  btn.classList.add("is-loading");
  btn.textContent = "Đang tóm tắt…";

  try {
    const rawContent = currentArticle.content || "";
    const truncated = /\[\+\d+ chars\]\s*$/.test(rawContent);
    const cleanContent = rawContent.replace(/\s*\[\+\d+ chars\]\s*$/, "");
    const source = [
      currentArticle.title,
      currentArticle.description,
      cleanContent,
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await summarize("article", {
      source,
      cacheText: currentArticle.url || source,
      truncated,
      sourceName: currentArticle.source?.name || "",
      publishedAt: currentArticle.publishedAt || "",
    });
    summaryBox.innerHTML = renderSummaryHTML(result);
    summaryBox.classList.remove("hidden", "card-summary-error");
    btn.dataset.state = "done";
    btn.textContent = "Tóm tắt lại";
  } catch (err) {
    summaryBox.classList.remove("hidden");
    summaryBox.classList.add("card-summary-error");
    if (err.message === "BAD_KEY") {
      summaryBox.textContent =
        "API key không hợp lệ. Vui lòng kiểm tra lại trong mục Ghi Chú.";
    } else if (err.message === "RATE_LIMIT") {
      if (err.isDaily) {
        summaryBox.textContent =
          "Đã dùng hết lượt Gemini miễn phí trong hôm nay (cả hai model). Hạn mức sẽ làm mới sau khi qua nửa đêm (giờ Thái Bình Dương, Mỹ).";
      } else {
        startRateLimitCountdown(summaryBox, err.retrySeconds);
      }
    } else {
      summaryBox.textContent = "Không thể tóm tắt. Vui lòng thử lại.";
    }
    btn.dataset.state = "";
    btn.innerHTML = `Tóm tắt bằng AI <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px"><path d="M8 1c0 3.5 1 5 4.5 5-3.5 0-4.5 1.5-4.5 5 0-3.5-1-5-4.5-5C7 6 8 4.5 8 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
  } finally {
    btn.disabled = false;
    btn.classList.remove("is-loading");
  }
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const diff = (Date.now() - d) / 1000;
    if (diff < 3600) return `${Math.round(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.round(diff / 3600)} giờ trước`;
    return `${Math.round(diff / 86400)} ngày trước`;
  } catch {
    return "";
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderNotFound(root) {
  root.innerHTML = `
    <div class="article-notfound">
      <strong>Không tìm thấy bài viết.</strong><br>
      Có thể bạn đã mở trực tiếp trang này, hoặc phiên làm việc đã hết hạn.<br>
      <a href="index.html"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px"><path d="M12 7H2M6 3L2 7l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Quay lại trang chủ</a> và chọn một bài viết.
    </div>`;
}

function renderArticle(article) {
  const root = document.getElementById("article-root");
  const source = article.source?.name || "";
  const meta = [
    timeAgo(article.publishedAt),
    article.author ? `Bởi ${article.author}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const rawContent = article.content || "";
  const truncated = /\[\+\d+ chars\]\s*$/.test(rawContent);
  const cleanContent = rawContent.replace(/\s*\[\+\d+ chars\]\s*$/, "").trim();

  const premium = isPremiumUser();

  root.innerHTML = `
    ${
      article.urlToImage
        ? `<img class="article-hero" src="${article.urlToImage}" alt=""
              onerror="this.style.display='none'">`
        : ""
    }
    <div class="article-card">
      <div class="article-header">
        ${source ? `<div class="card-source">${source}</div>` : ""}
        <h1 class="article-title">${escapeHtml(article.title || "Untitled")}</h1>
        ${meta ? `<div class="card-meta">${meta}</div>` : ""}
      </div>
      <div class="article-body">
        ${
          article.description
            ? `<p class="article-description">${escapeHtml(article.description)}</p>`
            : ""
        }
        ${cleanContent ? `<p class="article-text">${escapeHtml(cleanContent)}</p>` : ""}
        ${
          truncated || !cleanContent
            ? `<p class="article-truncated-note">Nội dung đầy đủ chỉ có tại nguồn gốc.</p>`
            : ""
        }
      </div>
      <div class="article-actions">
        <button class="card-summarize ${premium ? "" : "card-summarize-locked"}" id="article-summarize">
          ${premium ? `Tóm tắt bằng AI <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px"><path d="M8 1c0 3.5 1 5 4.5 5-3.5 0-4.5 1.5-4.5 5 0-3.5-1-5-4.5-5C7 6 8 4.5 8 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>` : "Tóm tắt bằng AI (Premium)"}
        </button>
        ${
          article.url
            ? `<button class="article-embed-toggle" id="article-embed-toggle">Xem toàn văn tại đây</button>
               <a class="article-source-link" href="${article.url}" target="_blank" rel="noopener">Đọc bài gốc <svg width="11" height="11" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-1px"><path d="M3 9L9 3M4 3h5v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></a>`
            : ""
        }
      </div>
    </div>
    <div class="card-summary hidden" id="article-summary"></div>
    <div class="article-embed-wrap hidden" id="article-embed-wrap">
      <div class="article-embed-note">
        Nội dung dưới đây tải trực tiếp từ trang gốc. Một số trang có thể chặn
        việc hiển thị theo cách này — nếu khung bên dưới trống, hãy dùng nút
        "Đọc bài gốc" ở trên.
      </div>
      <div class="article-embed-controls" id="article-embed-controls">
        <span class="article-embed-controls-label">Cỡ hiển thị</span>
        <div class="article-zoom-group">
          <button class="article-zoom-btn" id="article-zoom-out" aria-label="Thu nhỏ">−</button>
          <span class="article-zoom-level" id="article-zoom-level">100%</span>
          <button class="article-zoom-btn" id="article-zoom-in" aria-label="Phóng to">+</button>
        </div>
        <button class="article-zoom-reset" id="article-zoom-reset">Đặt lại</button>
      </div>
      <div class="article-embed-frame-holder" id="article-embed-holder"></div>
    </div>
  `;

  document
    .getElementById("article-summarize")
    .addEventListener("click", (e) => handleSummarizeClick(e.currentTarget));

  const embedToggle = document.getElementById("article-embed-toggle");
  if (embedToggle) {
    embedToggle.addEventListener("click", () => toggleEmbed(article.url));
  }
}

// The unscaled size we load the source page at. Rendering it at a real
// desktop width means the site shows its normal desktop layout (not a
// squished mobile one), which we then shrink down to fit — proportions
// stay correct instead of the page's own layout getting cut off.
const EMBED_UNSCALED_WIDTH = 1440;
const EMBED_UNSCALED_HEIGHT = 1440;

// User-controlled zoom on top of the auto-fit-to-width scale. Steps in
// 25% increments; clamped so the embed can't shrink to nothing or grow
// large enough to make the iframe unusably huge.
const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;

function toggleEmbed(url) {
  const wrap = document.getElementById("article-embed-wrap");
  const holder = document.getElementById("article-embed-holder");
  const toggle = document.getElementById("article-embed-toggle");
  const isOpen = !wrap.classList.contains("hidden");

  if (isOpen) {
    wrap.classList.add("hidden");
    holder.innerHTML = "";
    if (holder._onResize) {
      window.removeEventListener("resize", holder._onResize);
      holder._onResize = null;
    }
    toggle.textContent = "Xem toàn văn tại đây";
    return;
  }

  wrap.classList.remove("hidden");
  toggle.textContent = "Ẩn toàn văn";

  // Build the iframe only when opened, not on page load — most articles
  // won't get embedded, so no point loading them upfront.
  const scaleBox = document.createElement("div");
  scaleBox.className = "article-embed-scalebox";
  scaleBox.style.width = EMBED_UNSCALED_WIDTH + "px";
  scaleBox.style.height = EMBED_UNSCALED_HEIGHT + "px";
  scaleBox.style.transformOrigin = "top left";

  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.loading = "lazy";
  iframe.referrerPolicy = "no-referrer";
  iframe.width = EMBED_UNSCALED_WIDTH;
  iframe.height = EMBED_UNSCALED_HEIGHT;
  // Deliberately no "allow-top-navigation": if the source page tries a
  // frame-busting redirect, this keeps it contained instead of yanking
  // the user away from Pulse entirely.
  iframe.setAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-popups allow-forms",
  );

  scaleBox.appendChild(iframe);
  holder.innerHTML = "";
  holder.appendChild(scaleBox);

  let zoomFactor = 1;
  const zoomLevelEl = document.getElementById("article-zoom-level");
  const zoomOutBtn = document.getElementById("article-zoom-out");
  const zoomInBtn = document.getElementById("article-zoom-in");
  const zoomResetBtn = document.getElementById("article-zoom-reset");

  // Scale the whole box down (or up, via zoomFactor) so its base width
  // matches the available card width, then resize the holder to match —
  // that way there's no leftover blank space, and the page's own
  // proportions (text size, image size, layout) are preserved, just
  // smaller or larger depending on the user's chosen zoom level.
  function applyScale() {
    const availableWidth = holder.clientWidth || wrap.clientWidth;
    const fitScale = availableWidth / EMBED_UNSCALED_WIDTH;
    const scale = fitScale * zoomFactor;
    scaleBox.style.transform = `scale(${scale})`;
    scaleBox.style.width = EMBED_UNSCALED_WIDTH + "px";
    holder.style.height = Math.round(EMBED_UNSCALED_HEIGHT * scale) + "px";
    // At zoomFactor 1 the scaled box exactly matches availableWidth, so
    // there's nothing to scroll. Above 1 it overflows sideways — let
    // the holder scroll horizontally instead of clipping the content.
    holder.style.overflowX = zoomFactor > 1 ? "auto" : "hidden";
    if (zoomLevelEl)
      zoomLevelEl.textContent = Math.round(zoomFactor * 100) + "%";
    if (zoomOutBtn) zoomOutBtn.disabled = zoomFactor <= ZOOM_MIN;
    if (zoomInBtn) zoomInBtn.disabled = zoomFactor >= ZOOM_MAX;
  }

  function setZoom(next) {
    zoomFactor = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    applyScale();
  }

  if (zoomOutBtn) zoomOutBtn.onclick = () => setZoom(zoomFactor - ZOOM_STEP);
  if (zoomInBtn) zoomInBtn.onclick = () => setZoom(zoomFactor + ZOOM_STEP);
  if (zoomResetBtn) zoomResetBtn.onclick = () => setZoom(1);

  applyScale();
  holder._onResize = applyScale;
  window.addEventListener("resize", applyScale);

  wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ── RELATED ARTICLES ────────────────────────────────────────────
// Shows a handful of other articles that share vocabulary with the one
// currently open, so the reader has somewhere obvious to go next.

function renderRelatedGrid(articles) {
  const section = document.getElementById("related-section");
  const grid = document.getElementById("related-grid");

  if (!articles.length) {
    section.classList.add("hidden");
    grid.innerHTML = "";
    return;
  }

  grid.innerHTML = articles
    .map((a, i) => {
      const img = a.urlToImage || "";
      const source = a.source?.name || "";
      const meta = [timeAgo(a.publishedAt), a.author ? `Bởi ${a.author}` : ""]
        .filter(Boolean)
        .join(" · ");

      return `
      <article class="related-card" data-index="${i}">
        <div class="related-card-img-wrap">
          ${
            img
              ? `<img class="related-card-img" src="${img}" alt="" loading="lazy"
                    onerror="this.parentElement.style.display='none'">`
              : `<div class="related-card-img-placeholder"></div>`
          }
        </div>
        <div class="related-card-text">
          ${source ? `<div class="related-card-source">${escapeHtml(source)}</div>` : ""}
          <h4 class="related-card-title">${escapeHtml(a.title || "Untitled")}</h4>
          ${meta ? `<div class="related-card-meta">${meta}</div>` : ""}
        </div>
      </article>`;
    })
    .join("");

  grid.querySelectorAll(".related-card").forEach((card) => {
    const article = articles[Number(card.dataset.index)];
    card.addEventListener("click", () => openRelatedArticle(article));
  });

  section.classList.remove("hidden");
}

// Swaps the currently displayed article for a related one without a
// full page navigation — re-runs the same render pipeline in place,
// and updates sessionStorage so a refresh still shows the right article.
function openRelatedArticle(article) {
  currentArticle = article;
  sessionStorage.setItem(ARTICLE_STORAGE_KEY, JSON.stringify(article));
  renderArticle(article);
  loadRelatedArticles(article);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadRelatedArticles(article) {
  const section = document.getElementById("related-section");
  const grid = document.getElementById("related-grid");
  section.classList.remove("hidden");

  if (!isPremiumUser()) {
    grid.innerHTML = `
      <div class="related-locked">
        Gợi ý bài viết liên quan là tính năng dành cho gói Premium.
        <a href="premium.html">Nâng cấp ngay</a> để mở khóa.
      </div>`;
    return;
  }

  grid.innerHTML = `<div class="loading"><div class="spinner"></div><span>Đang tìm bài viết liên quan…</span></div>`;

  try {
    const related = await fetchRelatedArticles(article, 4);
    renderRelatedGrid(related);
  } catch {
    // Quietly hide the section on failure (e.g. rate limit) — related
    // articles are a bonus, not core to the page.
    section.classList.add("hidden");
    grid.innerHTML = "";
  }
}

// Re-runs the related-articles section whenever premium status becomes
// known/changes, so upgrading unlocks it live without a page reload.
function refreshRelatedSection() {
  if (!currentArticle) return;
  loadRelatedArticles(currentArticle);
}

function init() {
  const root = document.getElementById("article-root");
  const raw = sessionStorage.getItem(ARTICLE_STORAGE_KEY);
  if (!raw) {
    renderNotFound(root);
    return;
  }
  try {
    currentArticle = JSON.parse(raw);
  } catch {
    renderNotFound(root);
    return;
  }
  renderArticle(currentArticle);
  loadRelatedArticles(currentArticle);
}

document.addEventListener("DOMContentLoaded", init);
