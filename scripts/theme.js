(function () {
  const STORAGE_KEY = "pulse_news_theme";

  const themeStyles = document.createElement("style");
  themeStyles.id = "pulse-theme-stylesheet";
  themeStyles.textContent = `
    /* ==========================================
       1. LIGHT THEME (defaults already declared in
          style.css :root — restated here so both
          themes are defined in one obvious place and
          so pages that DON'T declare every token, like
          premium.css/notes.css, still get them)
       ========================================== */
    :root {
      --bg-gradient-start: #d6d8dc;
      --bg-gradient-end: #eceef0;
      --nav-bg: #ffffff;
      --card-bg: #ffffff;
      --card-hover-bg: #f7f7f7;
      --accent: #ff645e;
      --accent-alt: #1ab89e;
      --texts: #1a1a1a;
      --text-muted: #666680;
      --text-on-white: #1a1a1a;
      --text-on-gradient: #1a1a1a;
      --divider: #e8e8ee;
      --card-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
      --gold: #caa24a;
      --gold-light: #f4e4bb;
      --gold-dark: #8a6a1f;

      /* literal-color patches, light values */
      --surface-modal: #ffffff;
      --surface-paper: #fffdf7;
      --surface-paper-hover: #fbf9f2;
      --surface-overlay: rgba(20, 20, 30, 0.55);
      --icon-toggle: #1a1a1a;
    }

    /* ==========================================
       2. DARK THEME
       Deliberately NOT just "flip to gray" — the page
       background, card surface, and hover surface are
       three distinct steps of brightness so cards and
       nav are always visibly separated from the page,
       and accent colors are brightened so they still
       pop against a dark background instead of muddying.
       ========================================== */
    [data-theme="dark"] {
      --bg-gradient-start: #0e1014;
      --bg-gradient-end: #181b21;
      --nav-bg: #15171d;
      --card-bg: #1c1f27;
      --card-hover-bg: #262a34;
      --accent: #ff7f76;
      --accent-alt: #2dd4bf;
      --texts: #f2f3f6;
      --text-muted: #a3aab8;
      --text-on-white: #f2f3f6;
      --text-on-gradient: #f2f3f6;
      --divider: #2e323c;
      --card-shadow: 0 2px 16px rgba(0, 0, 0, 0.55);
      --gold: #e6bd6f;
      --gold-light: #3c331f;
      --gold-dark: #f5d999;

      /* literal-color patches, dark values */
      --surface-modal: #1c1f27;
      --surface-paper: #21242c;
      --surface-paper-hover: #2a2e38;
      --surface-overlay: rgba(0, 0, 0, 0.7);
      --icon-toggle: #f2f3f6;
    }

    /* ==========================================
       3. GLOBAL TRANSITION
       ========================================== */
    body,
    header, nav, .navbar,
    .card, article, [class*="-card"], [class*="-panel"], [class*="-box"],
    input, textarea, select {
      transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
    }

    /* ==========================================
       4. MISSING TOKEN FIXES
       ========================================== */
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* ==========================================
       5. LITERAL-COLOR PATCHES
       These elements set actual hex colors (not
       var(...)) in their stylesheets, so redefining
       tokens above doesn't reach them. Overridden
       here, scoped to dark mode only, so light mode
       is untouched.
       ========================================== */
    [data-theme="dark"] .popup-ad {
      background-color: var(--card-bg) !important;
      box-shadow: var(--card-shadow);
    }

    [data-theme="dark"] .notes-modal,
    [data-theme="dark"] .premium-modal {
      background: var(--surface-overlay) !important;
    }

    [data-theme="dark"] .notes-card {
      background: var(--surface-paper) !important;
    }

    [data-theme="dark"] .notes-title-input,
    [data-theme="dark"] .notes-textarea {
      background-color: var(--surface-paper) !important;
      color: var(--texts) !important;
    }

    [data-theme="dark"] .notes-title-input::placeholder,
    [data-theme="dark"] .notes-textarea::placeholder {
      color: var(--text-muted) !important;
    }

    [data-theme="dark"] .note-file {
      background: var(--surface-paper) !important;
      color: var(--texts);
    }

    [data-theme="dark"] .note-file:hover {
      background: var(--surface-paper-hover) !important;
    }

    [data-theme="dark"] .note-file-title {
      color: var(--texts) !important;
    }

    [data-theme="dark"] .premium-modal-card {
      background: var(--surface-modal) !important;
    }

    [data-theme="dark"] .plan-card-premium {
      background: linear-gradient(160deg, var(--card-hover-bg), var(--card-bg)) !important;
    }

    [data-theme="dark"] .auth-error {
      color: #ff9d94;
    }

    /* Inputs/selects/textareas that don't use the token vars at all.
       Excludes .nav-search-input: that one is deliberately transparent
       (background: none) so it blends into the pill-shaped .nav-search
       wrapper behind it — an attribute selector like [data-theme="dark"]
       input is MORE specific than a single class selector, so without
       this :not() it silently won the cascade and painted a solid
       --card-bg rectangle inside the search pill (the "black box" bug). */
    [data-theme="dark"] input:not(.nav-search-input),
    [data-theme="dark"] textarea,
    [data-theme="dark"] select {
      background-color: var(--card-bg);
      color: var(--texts);
      border-color: var(--divider);
    }

    /* Text sitting on the notes "paper" surface that hard-codes dark
       gray/black in the stylesheet (fine on the light cream paper, but
       invisible once the paper itself goes dark). */
    [data-theme="dark"] .notes-tab:hover,
    [data-theme="dark"] .note-detail-title {
      color: var(--texts) !important;
    }
    [data-theme="dark"] .note-detail-text {
      color: var(--text-muted) !important;
    }

    [data-theme="dark"] .notes-key-panel {
      background: var(--surface-paper) !important;
    }

    [data-theme="dark"] .notes-key-row input {
      background: var(--card-bg) !important;
      color: var(--texts) !important;
      border-color: var(--divider) !important;
    }

    /* AI summary result boxes (.card-summary on news cards/article page,
       .note-summary on saved notes) hard-code pale pastel backgrounds with
       dark text — good on a light card, invisible/low-contrast once the
       card around them goes dark. Re-tint as translucent washes over the
       dark surface instead, keeping each state's accent color as the cue. */
    [data-theme="dark"] .card-summary,
    [data-theme="dark"] .note-summary {
      background: rgba(45, 212, 191, 0.12) !important;
      color: var(--texts) !important;
    }
    [data-theme="dark"] .card-summary.card-summary-error,
    [data-theme="dark"] .note-summary.note-summary-error {
      background: rgba(255, 127, 118, 0.12) !important;
      color: var(--texts) !important;
    }
    [data-theme="dark"] .card-summary.card-summary-locked,
    [data-theme="dark"] .note-summary.note-summary-locked {
      background: rgba(230, 189, 111, 0.12) !important;
      color: var(--texts) !important;
    }
    [data-theme="dark"] .note-summary.note-summary-locked a {
      color: var(--gold-dark) !important;
    }
    [data-theme="dark"] .ai-summary-warn {
      color: var(--gold-dark) !important;
    }

    /* Topic tag chips inside a summary box: translucent white looks right
       on a light mint card, but washes out to near-invisible on the dark
       translucent tint above. */
    [data-theme="dark"] .ai-summary-tag {
      background: rgba(255, 255, 255, 0.08);
    }

    /* Locked-state summarize button: dark gold text with no background
       (just a border) reads fine on a white card, not on a dark one. */
    [data-theme="dark"] .card-summarize-locked {
      border-color: var(--gold);
      color: var(--gold-dark);
    }

    /* Topic dropdown's hover/open state hard-codes a light gray fill;
       combined with the (now light) --text-on-white text this made the
       selected/hovered pill nearly unreadable in dark mode. */
    [data-theme="dark"] .topic-dropdown-btn:hover,
    [data-theme="dark"] .topic-dropdown.open .topic-dropdown-btn {
      background-color: var(--card-hover-bg) !important;
    }

    [data-theme="dark"] .plan-features li::before {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M2 6.5l2.5 2.5L10 3' stroke='%23f2f3f6' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    }
    [data-theme="dark"] .plan-features li.feature-disabled::before {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M1 1l10 10M11 1L1 11' stroke='%23636b7a' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
    }

    [data-theme="dark"] ::selection {
      background: var(--accent);
      color: #1a1a1a;
    }

    /* ==========================================
       6. TOGGLE BUTTON
       ========================================== */
    .theme-toggle-btn {
      background-color: var(--card-hover-bg);
      color: var(--icon-toggle);
      border: 1px solid var(--divider);
      padding: 6px 12px;
      border-radius: 20px;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
      transition: opacity 0.2s ease, transform 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
      box-shadow: var(--card-shadow);
    }

    .theme-toggle-btn:hover {
      opacity: 0.85;
      transform: translateY(-1px);
    }

    .theme-toggle-btn svg {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      fill: none;
      flex-shrink: 0;
    }

    /* Belt-and-suspenders: force the toggle button's own colors in dark
       mode explicitly, rather than relying purely on --card-hover-bg /
       --icon-toggle inheritance, in case anything else in the cascade
       (or a stale cached copy of this file) ever fights it. */
    [data-theme="dark"] .theme-toggle-btn {
      background-color: var(--card-hover-bg) !important;
      color: var(--icon-toggle) !important;
      border-color: var(--divider) !important;
    }
  `;
  document.head.appendChild(themeStyles);

  // Inline SVG line icons (sun / moon), stroke = currentColor so they
  // always match --icon-toggle without needing separate light/dark assets.
  const ICONS = {
    sun: `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>`,
    moon: `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`,
  };

  // 2. Load Saved Theme Immediately (prevents flash of wrong theme on load)
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  let userHasExplicitPreference = !!localStorage.getItem(STORAGE_KEY);

  function resolveTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
    return mql.matches ? "dark" : "light";
  }

  let activeTheme = resolveTheme();
  document.documentElement.setAttribute("data-theme", activeTheme);

  // 3. Inject Toggle Button & Set Event Listeners on DOM Ready
  document.addEventListener("DOMContentLoaded", () => {
    let toggleBtn = document.querySelector(".theme-toggle-btn");

    if (!toggleBtn) {
      toggleBtn = document.createElement("button");
      toggleBtn.className = "theme-toggle-btn";
      toggleBtn.setAttribute("type", "button");
      toggleBtn.setAttribute("aria-label", "Chuyển đổi chế độ sáng/tối");

      const targetNav =
        document.querySelector("header") ||
        document.querySelector("nav") ||
        document.body;
      targetNav.appendChild(toggleBtn);
    }

    function updateUI(theme) {
      const isDark = theme === "dark";
      toggleBtn.innerHTML = `${isDark ? ICONS.sun : ICONS.moon}<span>${isDark ? "Sáng" : "Tối"}</span>`;
      toggleBtn.setAttribute("aria-pressed", String(isDark));
    }

    updateUI(activeTheme);

    toggleBtn.addEventListener("click", () => {
      activeTheme = activeTheme === "dark" ? "light" : "dark";
      userHasExplicitPreference = true;
      document.documentElement.setAttribute("data-theme", activeTheme);
      localStorage.setItem(STORAGE_KEY, activeTheme);
      updateUI(activeTheme);
    });

    // Keep in sync with OS-level theme changes, but only while the
    // person hasn't made an explicit choice on this site (bug fix:
    // previously the OS preference was only checked once on load).
    mql.addEventListener("change", (e) => {
      if (userHasExplicitPreference) return;
      activeTheme = e.matches ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", activeTheme);
      updateUI(activeTheme);
    });
  });
})();
