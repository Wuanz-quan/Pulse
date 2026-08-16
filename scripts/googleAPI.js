// ── CONFIG ──────────────────────────────────────────────────
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getGeminiKey,
  summarize,
  clearRateLimitCountdown,
  startRateLimitCountdown,
  renderSummaryHTML,
} from "./summarizer.js";
import { TOPIC_MAP, fetchNews, searchNews } from "./newsapi.js";

// ── PREMIUM GATE ────────────────────────────────────────────────
// AI Summary is a Premium-only feature. Premium status is stored by
// premium.js, keyed by Firebase uid.
let currentUser = null;

function isPremiumUser() {
  return (
    !!currentUser &&
    localStorage.getItem(`pulse_premium_${currentUser.uid}`) === "active"
  );
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  updateSummarizeButtonsState();
});

window.addEventListener("pulse:premium-changed", updateSummarizeButtonsState);

function updateSummarizeButtonsState() {
  const premium = isPremiumUser();
  document.querySelectorAll(".card-summarize").forEach((btn) => {
    if (btn.dataset.state === "loading") return; // don't clobber an in-flight request
    btn.classList.toggle("card-summarize-locked", !premium);
    if (btn.dataset.state !== "done") {
      btn.innerHTML = premium ? `Tóm tắt bằng AI` : "Tóm tắt bằng AI (Premium)";
    }
  });
}

// ── AI SUMMARY (Google Gemini — shares the same key as Notes) ──
// Actual request/response handling, caching, model fallback, and
// grounding checks now live in summarizer.js so this file only deals
// with card-specific UI wiring.

async function handleCardSummarizeClick(e, btn, article) {
  e.stopPropagation(); // don't trigger the card's "open article" click

  const card = btn.closest("article");
  const summaryBox = card.querySelector(".card-summary");
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

  const rawContent = article.content || "";
  const truncated = /\[\+\d+ chars\]\s*$/.test(rawContent);
  const cleanContent = rawContent.replace(/\s*\[\+\d+ chars\]\s*$/, "");
  const source = [article.title, article.description, cleanContent]
    .filter(Boolean)
    .join("\n\n");

  try {
    const result = await summarize("article", {
      source,
      cacheText: article.url || source,
      truncated,
      sourceName: article.source?.name || "",
      publishedAt: article.publishedAt || "",
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

// ── RENDER ──────────────────────────────────────────────────
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

// Small helper: pull up to `n` items off the front of a shared queue,
// used to divvy up one fetched article list across several sections.
function take(queue, n) {
  return queue.splice(0, n);
}

// Required image slot (falls back to a plain placeholder box).
function cardImg(a, wrapClass, imgClass) {
  const img = a.urlToImage || "";
  return img
    ? `<div class="${wrapClass}"><img class="${imgClass}" src="${img}" alt="" loading="lazy"
          onerror="this.parentElement.style.display='none'"></div>`
    : `<div class="${wrapClass} card-img-placeholder"></div>`;
}

// Optional image slot — renders nothing at all when there's no photo,
// for compact rows that read fine as text-only (matches text-only rows
// in the reference layout).
function cardImgOptional(a, wrapClass) {
  const img = a.urlToImage || "";
  if (!img) return "";
  return `<div class="${wrapClass}"><img src="${img}" alt="" loading="lazy"
        onerror="this.parentElement.remove()"></div>`;
}

function dateLabel(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function renderMagazine(articles) {
  const container = document.getElementById("news-container");
  if (!articles.length) {
    container.innerHTML = `<div class="empty">Hiện không tìm thấy tin tức nào.</div>`;
    return;
  }

  const premium = isPremiumUser();
  const queue = articles.slice(); // working copy we consume section by section
  const allShown = []; // every article actually rendered, index-addressable

  const registerCards = (arr) => {
    const startIndex = allShown.length;
    allShown.push(...arr);
    return arr.map((a, i) => ({ article: a, index: startIndex + i }));
  };

  // ── HERO + sidebar list ("Entertainment & Arts") ──────────────────
  const hero = registerCards(take(queue, 1))[0];
  const sideItems = registerCards(take(queue, 4));

  const heroHTML = hero
    ? `
      <article class="hero-card" data-index="${hero.index}">
        ${
          hero.article.urlToImage
            ? `<img src="${hero.article.urlToImage}" alt="" loading="lazy" onerror="this.remove()">`
            : ""
        }
        <div class="hero-overlay"></div>
        <div class="hero-card-body">
          <div class="card-meta-row hero-meta">
            ${hero.article.source?.name ? `<span>${hero.article.source.name}</span><span class="dot">·</span>` : ""}
            <span>${dateLabel(hero.article.publishedAt)}</span>
          </div>
          <h1 class="hero-title">${hero.article.title || "Untitled"}</h1>
          ${hero.article.description ? `<p class="hero-snippet">${hero.article.description}</p>` : ""}
          <div class="card-summary hidden"></div>
          <div class="card-actions hero-card-actions">
            <button class="card-summarize ${premium ? "" : "card-summarize-locked"}" data-index="${hero.index}">
              ${premium ? `Tóm tắt bằng AI <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px"><path d="M8 1c0 3.5 1 5 4.5 5-3.5 0-4.5 1.5-4.5 5 0-3.5-1-5-4.5-5C7 6 8 4.5 8 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>` : "Tóm tắt bằng AI (Premium)"}
            </button>
          </div>
        </div>
      </article>`
    : "";

  const sideHTML = sideItems.length
    ? `
      <div class="side-panel">
        <div class="section-header"><span class="section-header-bar"></span>Giải Trí &amp; Nghệ Thuật</div>
        <div class="side-list">
          ${sideItems
            .map(
              ({ article: a, index: i }) => `
            <article class="side-row" data-index="${i}">
              <div class="side-row-body">
                <h3 class="side-row-title">${a.title || "Untitled"}</h3>
                <span class="side-row-meta">${a.source?.name ? a.source.name + " · " : ""}${dateLabel(a.publishedAt)}</span>
              </div>
              ${cardImgOptional(a, "side-row-img-wrap")}
            </article>`,
            )
            .join("")}
        </div>
      </div>`
    : "";

  const heroRowHTML =
    hero || sideItems.length
      ? `<section class="mag-panel"><div class="hero-grid">${heroHTML}${sideHTML}</div></section>`
      : "";

  // ── TWIN COLUMNS ("Local News" / "Stories") ────────────────────────
  const twinColumn = (label) => {
    const feature = registerCards(take(queue, 1))[0];
    const extras = registerCards(take(queue, 2));
    if (!feature) return "";
    return `
      <div class="twin-col">
        <div class="section-header"><span class="section-header-bar"></span>${label}</div>
        <article class="twin-feature-card" data-index="${feature.index}">
          ${cardImg(feature.article, "twin-feature-img-wrap", "")}
          <div class="card-meta-row twin-feature-meta">
            ${feature.article.source?.name ? `<span>${feature.article.source.name}</span><span class="dot">·</span>` : ""}
            <span>${dateLabel(feature.article.publishedAt)}</span>
          </div>
          <h3 class="twin-feature-title">${feature.article.title || "Untitled"}</h3>
        </article>
        ${
          extras.length
            ? `<div class="twin-extra-list">
                ${extras
                  .map(
                    ({ article: a, index: i }) => `
                  <article class="twin-extra-row" data-index="${i}">
                    <div class="twin-extra-body">
                      <span class="card-meta-row twin-extra-meta">${a.source?.name || ""}</span>
                      <h4 class="twin-extra-title">${a.title || "Untitled"}</h4>
                    </div>
                    ${cardImgOptional(a, "twin-extra-img-wrap")}
                  </article>`,
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>`;
  };

  const col1HTML = twinColumn("Tin Địa Phương");
  const col2HTML = twinColumn("Câu Chuyện");
  const twinGridHTML =
    col1HTML || col2HTML
      ? `<section class="mag-panel"><div class="twin-grid">${col1HTML}${col2HTML}</div></section>`
      : "";

  container.innerHTML = heroRowHTML + twinGridHTML;
  bindCardEvents(container, allShown);
}

// Shared by every layout: every clickable card is an <article data-index>
// indexing into `allShown`; every summarize button/summary box works the
// same way regardless of which layout rendered it.
function bindCardEvents(container, allShown) {
  container.querySelectorAll("article[data-index]").forEach((card) => {
    const article = allShown[Number(card.dataset.index)];
    if (!article) return;
    card.addEventListener("click", () => openArticleDetail(article));
  });

  container.querySelectorAll(".card-summarize").forEach((btn) => {
    const article = allShown[Number(btn.dataset.index)];
    if (!article) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleCardSummarizeClick(e, btn, article);
    });
  });

  container.querySelectorAll(".card-summary").forEach((box) => {
    box.addEventListener("click", (e) => e.stopPropagation());
  });
}

// ── SIMPLE LISTING (used for search results) ─────────────────────────
// A plain vertical list of cards instead of the magazine grid — reads
// better for a results feed than a fixed hero/twin-column layout does.
function renderListing(articles) {
  const container = document.getElementById("news-container");
  if (!articles.length) {
    container.innerHTML = `<div class="empty">Hiện không tìm thấy tin tức nào.</div>`;
    return;
  }

  const premium = isPremiumUser();
  const allShown = articles.slice();

  const cardsHTML = allShown
    .map((a, i) => {
      const featured = i === 0;
      return `
      <article class="news-card${featured ? " featured" : ""}" data-index="${i}">
        <div class="card-text">
          <span class="card-source">${a.source?.name || ""}</span>
          <h3 class="card-title">${a.title || "Untitled"}</h3>
          ${a.description ? `<p class="card-snippet">${a.description}</p>` : ""}
          <span class="card-meta">${dateLabel(a.publishedAt)}</span>
          <div class="card-summary hidden"></div>
          <div class="card-actions">
            <button class="card-summarize ${premium ? "" : "card-summarize-locked"}" data-index="${i}">
              ${premium ? `Tóm tắt bằng AI <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px"><path d="M8 1c0 3.5 1 5 4.5 5-3.5 0-4.5 1.5-4.5 5 0-3.5-1-5-4.5-5C7 6 8 4.5 8 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>` : "Tóm tắt bằng AI (Premium)"}
            </button>
          </div>
        </div>
        ${cardImg(a, "card-img-wrap", "card-img")}
      </article>`;
    })
    .join("");

  container.innerHTML = `<div class="news-list">${cardsHTML}</div>`;
  bindCardEvents(container, allShown);
}

// Stashes the clicked article and sends the user to the detail page.
// sessionStorage (not localStorage) keeps this scoped to the current tab
// and clears itself once the tab/session ends.
function openArticleDetail(article) {
  sessionStorage.setItem("pulse_selected_article", JSON.stringify(article));
  location.href = "article.html";
}

// ── LOAD TOPIC ───────────────────────────────────────────────
async function loadTopic(topic) {
  const label = TOPIC_MAP[topic]?.label || topic;
  document.getElementById("section-label").textContent = label;
  const container = document.getElementById("news-container");
  container.innerHTML = `<div class="loading"><div class="spinner"></div><span>Đang tải ${label}…</span></div>`;

  try {
    // pageSize 20 gives enough articles to fill every magazine section
    // (Editor's Picks, Main News, Featured Posts, two Express rows).
    const articles = await fetchNews(topic, 20);
    renderMagazine(articles);
  } catch (err) {
    container.innerHTML = `
      <div class="error">
        <strong>Không thể tải tin tức.</strong><br>
        ${err.message}<br>
        <small>Lấy khóa miễn phí tại <a href="https://newsapi.org" target="_blank">newsapi.org</a>
        và mở trang này dưới dạng <code>index.html?key=KHÓA_CỦA_BẠN</code></small>
      </div>`;
  }
}

async function loadSearch(query) {
  const label = `Kết quả cho “${query}”`;
  document.getElementById("section-label").textContent = label;
  const container = document.getElementById("news-container");
  container.innerHTML = `<div class="loading"><div class="spinner"></div><span>Đang tìm “${query}”…</span></div>`;

  try {
    const articles = await searchNews(query);
    renderListing(articles);
  } catch (err) {
    container.innerHTML = `
      <div class="error">
        <strong>Không thể tìm kiếm.</strong><br>
        ${err.message}<br>
        <small>Lấy khóa miễn phí tại <a href="https://newsapi.org" target="_blank">newsapi.org</a>
        và mở trang này dưới dạng <code>index.html?key=KHÓA_CỦA_BẠN</code></small>
      </div>`;
  }
}

// ── SEARCH BAR ───────────────────────────────────────────────
const searchForm = document.getElementById("nav-search");
const searchInput = document.getElementById("search-input");
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;
  loadSearch(query);
});

// ── TOPIC DROPDOWN ───────────────────────────────────────────
const topicDropdown = document.getElementById("topic-dropdown");
const topicDropdownBtn = document.getElementById("topic-dropdown-btn");
const topicDropdownLabel = document.getElementById("topic-dropdown-label");
const topicDropdownMenu = document.getElementById("topic-dropdown-menu");
const topicDropdownOptions = topicDropdownMenu.querySelectorAll(
  ".topic-dropdown-option",
);

function openTopicDropdown() {
  topicDropdown.classList.add("open");
  topicDropdownBtn.setAttribute("aria-expanded", "true");
}
function closeTopicDropdown() {
  topicDropdown.classList.remove("open");
  topicDropdownBtn.setAttribute("aria-expanded", "false");
}

function setActiveTopic(topic) {
  topicDropdownOptions.forEach((opt) => {
    const isMatch = opt.dataset.topic === topic;
    opt.classList.toggle("active", isMatch);
    opt.setAttribute("aria-selected", isMatch ? "true" : "false");
  });
  topicDropdownLabel.textContent = TOPIC_MAP[topic]?.label || topic;
}

topicDropdownBtn.addEventListener("click", () => {
  topicDropdown.classList.contains("open")
    ? closeTopicDropdown()
    : openTopicDropdown();
});

topicDropdownOptions.forEach((opt) => {
  opt.addEventListener("click", () => {
    const topic = opt.dataset.topic;
    setActiveTopic(topic);
    closeTopicDropdown();
    searchInput.value = ""; // a topic pick overrides any active search
    loadTopic(topic);
  });
});

document.addEventListener("click", (e) => {
  if (!topicDropdown.contains(e.target)) closeTopicDropdown();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeTopicDropdown();
});

// ── INIT ──────────────────────────────────────────────────────
// Honor a ?topic= query param (used by links from article.html) so
// returning to a specific section lands on the right tab.
const requestedTopic = new URLSearchParams(location.search).get("topic");
const initialTopic = TOPIC_MAP[requestedTopic] ? requestedTopic : "top";
setActiveTopic(initialTopic);
loadTopic(initialTopic);
