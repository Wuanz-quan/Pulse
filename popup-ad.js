// ── POPUP AD ────────────────────────────────────────────────────
// A small ad that slides/bounces in from the bottom-left corner.
// It shows as soon as the page loads. Closing it (X button) hides
// it, and it comes back automatically after a 30-second cooldown.
const POPUP_AD_REAPPEAR_MS = 30000;

function initPopupAd() {
  const popupAd = document.getElementById("popup-ad");
  const closeBtn = document.getElementById("popup-ad-close");
  if (!popupAd || !closeBtn) return;

  let reappearTimer = null;

  function showPopupAd() {
    clearTimeout(reappearTimer);
    popupAd.classList.remove("hidden", "hide-anim", "show");
    // Force a reflow so the "show" animation restarts even if the
    // ad is already visible from a previous appearance.
    void popupAd.offsetWidth;
    popupAd.classList.add("show");
  }

  function hidePopupAd() {
    popupAd.classList.remove("show");
    popupAd.classList.add("hide-anim");
    setTimeout(() => {
      popupAd.classList.add("hidden");
    }, 500);

    clearTimeout(reappearTimer);
    reappearTimer = setTimeout(showPopupAd, POPUP_AD_REAPPEAR_MS);
  }

  closeBtn.addEventListener("click", hidePopupAd);

  showPopupAd();
}

document.addEventListener("DOMContentLoaded", initPopupAd);
