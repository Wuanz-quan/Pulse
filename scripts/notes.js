// ── NOTES FEATURE ──────────────────────────────────────────────
// Saves notes to localStorage (this is a local-file site, no backend).
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getGeminiKey,
  setGeminiKey,
  summarize,
  clearRateLimitCountdown,
  startRateLimitCountdown,
  renderSummaryHTML,
} from "./summarizer.js";

const NOTES_STORAGE_KEY = "pulse_saved_notes";
const NOTES_DRAFT_KEY = "pulse_note_draft";
const NOTES_TITLE_DRAFT_KEY = "pulse_note_title_draft";

let savedNotes = loadSavedNotes();
let draftSaveTimer = null;
let titleDraftSaveTimer = null;

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

let notesInitialized = false;
let currentDetailId = null;

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  // Re-render so summarize buttons reflect the current premium status.
  if (notesInitialized) refreshNotesView();
});

window.addEventListener("pulse:premium-changed", () => {
  if (notesInitialized) refreshNotesView();
});

function refreshNotesView() {
  if (currentDetailId) {
    const note = savedNotes.find((n) => n.id === currentDetailId);
    if (note) renderNoteDetail(note);
  }
  renderSavedNotes();
}

// ── AI SUMMARY (Google Gemini — free tier, no billing needed) ──
// Request/response handling, caching, model fallback, and grounding
// checks now live in summarizer.js.

async function handleSummarizeClick(btn, id) {
  const note = savedNotes.find((n) => n.id === id);
  if (!note) return;

  const summaryBox = document.getElementById("note-detail-summary");
  if (!summaryBox) return;

  if (!isPremiumUser()) {
    showPremiumUpsell(summaryBox);
    return;
  }

  if (!getGeminiKey()) {
    openKeyPanel();
    return;
  }

  clearRateLimitCountdown(summaryBox);

  btn.disabled = true;
  btn.classList.add("is-loading");
  btn.textContent = "Đang tóm tắt…";

  try {
    const result = await summarize("note", { text: note.text });
    note.summary = result.summary;
    note.summaryKeyPoints = result.keyPoints;
    persistSavedNotes();

    summaryBox.innerHTML = renderSummaryHTML(result);
    summaryBox.classList.remove("hidden", "note-summary-error");
    btn.textContent = "Tóm tắt lại";
  } catch (err) {
    if (err.message === "NO_KEY") {
      openKeyPanel();
      btn.innerHTML = `Tóm tắt bằng AI <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px"><path d="M8 1c0 3.5 1 5 4.5 5-3.5 0-4.5 1.5-4.5 5 0-3.5-1-5-4.5-5C7 6 8 4.5 8 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
      btn.disabled = false;
      btn.classList.remove("is-loading");
      return;
    }
    summaryBox.classList.remove("hidden");
    summaryBox.classList.add("note-summary-error");
    if (err.message === "BAD_KEY") {
      summaryBox.textContent = "API key không hợp lệ. Vui lòng kiểm tra lại.";
      openKeyPanel();
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
    btn.innerHTML = `Tóm tắt bằng AI <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px"><path d="M8 1c0 3.5 1 5 4.5 5-3.5 0-4.5 1.5-4.5 5 0-3.5-1-5-4.5-5C7 6 8 4.5 8 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
  } finally {
    btn.disabled = false;
    btn.classList.remove("is-loading");
  }
}

function showPremiumUpsell(summaryBox) {
  summaryBox.innerHTML = `Tóm tắt bằng AI là tính năng dành cho gói Premium. <a href="premium.html">Nâng cấp ngay</a> để mở khóa.`;
  summaryBox.classList.remove("hidden");
  summaryBox.classList.remove("note-summary-error");
  summaryBox.classList.add("note-summary-locked");
}

function openKeyPanel() {
  notesKeyPanel.classList.remove("hidden");
  notesKeyInput.value = getGeminiKey();
  notesKeyInput.focus();
}
function closeKeyPanel() {
  notesKeyPanel.classList.add("hidden");
}

function loadSavedNotes() {
  try {
    return JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}
function persistSavedNotes() {
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(savedNotes));
}
function loadDraft() {
  return localStorage.getItem(NOTES_DRAFT_KEY) || "";
}
function persistDraft(text) {
  localStorage.setItem(NOTES_DRAFT_KEY, text);
}
function clearDraft() {
  localStorage.removeItem(NOTES_DRAFT_KEY);
}
function loadTitleDraft() {
  return localStorage.getItem(NOTES_TITLE_DRAFT_KEY) || "";
}
function persistTitleDraft(title) {
  localStorage.setItem(NOTES_TITLE_DRAFT_KEY, title);
}
function clearTitleDraft() {
  localStorage.removeItem(NOTES_TITLE_DRAFT_KEY);
}
function formatNoteDate(iso) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("vi-VN", { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
  );
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── DOM refs ──────────────────────────────────────────────────
let notesModal,
  notesTrigger,
  notesCloseBtn,
  notesTabs,
  notesPanelWrite,
  notesPanelSaved,
  notesTitleInput,
  notesTextarea,
  notesSaveBtn,
  notesSavedList,
  noteDetail,
  notesCount,
  notesKeyBtn,
  notesKeyPanel,
  notesKeyInput,
  notesKeySaveBtn;

function initNotes() {
  notesModal = document.getElementById("notes-modal");
  notesTrigger = document.getElementById("notes-trigger");
  notesCloseBtn = document.getElementById("notes-close");
  notesTabs = document.querySelectorAll(".notes-tab[data-tab]");
  notesPanelWrite = document.getElementById("notes-panel-write");
  notesPanelSaved = document.getElementById("notes-panel-saved");
  notesTitleInput = document.getElementById("notes-title-input");
  notesTextarea = document.getElementById("notes-textarea");
  notesSaveBtn = document.getElementById("notes-save-btn");
  notesSavedList = document.getElementById("notes-saved-list");
  noteDetail = document.getElementById("note-detail");
  notesCount = document.getElementById("notes-count");
  notesKeyBtn = document.getElementById("notes-key-btn");
  notesKeyPanel = document.getElementById("notes-key-panel");
  notesKeyInput = document.getElementById("notes-key-input");
  notesKeySaveBtn = document.getElementById("notes-key-save");

  if (!notesModal) return;

  // Restore unsaved draft text/title, if any
  notesTextarea.value = loadDraft();
  notesTitleInput.value = loadTitleDraft();

  notesTrigger.addEventListener("click", openNotesModal);
  notesCloseBtn.addEventListener("click", closeNotesModal);
  notesModal.addEventListener("click", (e) => {
    if (e.target === notesModal) closeNotesModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && notesModal.classList.contains("open")) {
      closeNotesModal();
    }
  });

  // Tab 1 (Write) / Tab 2 (Saved) switch the visible panel
  notesTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchNotesTab(tab.dataset.tab));
  });

  // Tab 3 (Save) is an action, not a panel switch
  notesSaveBtn.addEventListener("click", saveCurrentNote);

  // API key settings
  notesKeyBtn.addEventListener("click", () => {
    if (!isPremiumUser()) {
      window.location.href = "premium.html";
      return;
    }
    notesKeyPanel.classList.toggle("hidden");
    if (!notesKeyPanel.classList.contains("hidden")) {
      notesKeyInput.value = getGeminiKey();
      notesKeyInput.focus();
    }
  });
  notesKeySaveBtn.addEventListener("click", () => {
    const key = notesKeyInput.value.trim();
    if (!key) return;
    setGeminiKey(key);
    closeKeyPanel();
  });
  notesKeyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") notesKeySaveBtn.click();
  });

  // Debounced draft autosave while typing
  notesTextarea.addEventListener("input", () => {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => persistDraft(notesTextarea.value), 500);
  });
  notesTitleInput.addEventListener("input", () => {
    clearTimeout(titleDraftSaveTimer);
    titleDraftSaveTimer = setTimeout(
      () => persistTitleDraft(notesTitleInput.value),
      500,
    );
  });

  notesInitialized = true;
  renderSavedNotes();
}

function openNotesModal() {
  notesModal.classList.add("open");
  document.body.style.overflow = "hidden";
  notesTextarea.focus();
}
function closeNotesModal() {
  notesModal.classList.remove("open");
  document.body.style.overflow = "";
}

function switchNotesTab(tabName) {
  notesTabs.forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === tabName),
  );
  notesPanelWrite.classList.toggle("hidden", tabName !== "write");
  notesPanelSaved.classList.toggle("hidden", tabName !== "saved");
}

// Tab 3: save the current note, move it into the saved space,
// and clear the write space.
function saveCurrentNote() {
  const text = notesTextarea.value.trim();
  const title = notesTitleInput.value.trim();

  if (!text) {
    notesTextarea.classList.add("shake");
    setTimeout(() => notesTextarea.classList.remove("shake"), 400);
    notesTextarea.focus();
    return;
  }

  savedNotes.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title,
    text,
    date: new Date().toISOString(),
  });
  persistSavedNotes();

  notesTextarea.value = "";
  notesTitleInput.value = "";
  clearDraft();
  clearTitleDraft();

  renderSavedNotes();
  currentDetailId = null;
  noteDetail.classList.add("hidden");
  notesSavedList.classList.remove("hidden");
  switchNotesTab("saved");
}

function deleteNote(id) {
  savedNotes = savedNotes.filter((n) => n.id !== id);
  persistSavedNotes();
  renderSavedNotes();
}

// A note is shown as a single-line "file" row — title only, no body —
// so a long note no longer stretches the whole list. The full text (and
// the AI summary/actions) only render once the row is clicked, in the
// detail view below.
// Prefer the note's own title; fall back to the first non-empty line of
// the body for notes saved before the title field existed (or left
// blank), so old notes still get a sensible row label.
function noteTitle(note) {
  if (note.title && note.title.trim()) return note.title.trim();
  const firstLine =
    note.text.split("\n").find((line) => line.trim()) || note.text;
  return firstLine.trim();
}

function renderSavedNotes() {
  const count = savedNotes.length;
  notesCount.textContent = count || "";
  notesCount.classList.toggle("hidden", count === 0);

  if (!count) {
    notesSavedList.innerHTML = `<div class="notes-empty">Chưa có ghi chú nào được lưu. Hãy viết gì đó rồi nhấn Lưu.</div>`;
    return;
  }

  notesSavedList.innerHTML = savedNotes
    .map(
      (n) => `
      <div class="note-file" data-id="${n.id}">
        <span class="note-file-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11 2l3 3-8.5 8.5H2.5v-3L11 2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg></span>
        <div class="note-file-info">
          <div class="note-file-title">${escapeHtml(noteTitle(n))}</div>
          <div class="note-file-meta">
            ${formatNoteDate(n.date)}${n.summary ? ` <span class="note-file-badge"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px"><path d="M8 1c0 3.5 1 5 4.5 5-3.5 0-4.5 1.5-4.5 5 0-3.5-1-5-4.5-5C7 6 8 4.5 8 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg> Đã tóm tắt</span>` : ""}
          </div>
        </div>
        <button class="note-delete" data-id="${n.id}" aria-label="Xóa ghi chú"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 3.5h9M5.5 3.5V2h3v1.5M3.5 3.5l.5 8.5h6l.5-8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>`,
    )
    .join("");

  notesSavedList.querySelectorAll(".note-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteNote(btn.dataset.id);
    });
  });

  notesSavedList.querySelectorAll(".note-file").forEach((row) => {
    row.addEventListener("click", () => openNoteDetail(row.dataset.id));
  });
}

// ── Note detail view — full text + summary, opened on row click ──
function openNoteDetail(id) {
  const note = savedNotes.find((n) => n.id === id);
  if (!note) return;
  currentDetailId = id;
  renderNoteDetail(note);
  notesSavedList.classList.add("hidden");
  noteDetail.classList.remove("hidden");
}

function closeNoteDetail() {
  currentDetailId = null;
  noteDetail.classList.add("hidden");
  notesSavedList.classList.remove("hidden");
  // Refresh the list in case a summary was just added — that flips the
  // "✨ Đã tóm tắt" badge on for that row.
  renderSavedNotes();
}

function renderNoteDetail(note) {
  const premium = isPremiumUser();
  noteDetail.innerHTML = `
    <div class="note-detail-header">
      <button class="note-detail-back" id="note-detail-back"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px"><path d="M12 7H2M6 3L2 7l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Quay lại</button>
      <div class="note-detail-header-right">
        <span class="note-detail-date">${formatNoteDate(note.date)}</span>
        <button class="note-detail-delete" id="note-detail-delete" aria-label="Xóa ghi chú"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 3.5h9M5.5 3.5V2h3v1.5M3.5 3.5l.5 8.5h6l.5-8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
    </div>
    ${
      note.title && note.title.trim()
        ? `<div class="note-detail-title">${escapeHtml(note.title.trim())}</div>`
        : ""
    }
    <div class="note-detail-text">${escapeHtml(note.text)}</div>
    <div class="note-item-actions">
      <button class="note-summarize ${premium ? "" : "note-summarize-locked"}" id="note-detail-summarize" data-id="${note.id}">
        ${
          premium
            ? note.summary
              ? "Tóm tắt lại"
              : `Tóm tắt bằng AI`
            : "Tóm tắt bằng AI (Premium)"
        }
      </button>
    </div>
    <div class="note-summary ${note.summary ? "" : "hidden"}" id="note-detail-summary">${
      note.summary
        ? renderSummaryHTML({
            summary: note.summary,
            keyPoints: note.summaryKeyPoints || [],
            topics: [],
          })
        : ""
    }</div>
  `;

  document
    .getElementById("note-detail-back")
    .addEventListener("click", closeNoteDetail);
  document
    .getElementById("note-detail-delete")
    .addEventListener("click", () => {
      deleteNote(note.id);
      currentDetailId = null;
      noteDetail.classList.add("hidden");
      notesSavedList.classList.remove("hidden");
    });
  document
    .getElementById("note-detail-summarize")
    .addEventListener("click", (e) =>
      handleSummarizeClick(e.currentTarget, note.id),
    );
}

document.addEventListener("DOMContentLoaded", initNotes);
