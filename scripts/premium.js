// ── PREMIUM PAGE ──────────────────────────────────────────────
// No payment backend exists for this project, so "upgrading" is a
// clearly-labeled demo flow. The result is stored locally per
// signed-in user (keyed by Firebase uid) so the rest of the app
// (nav badge, etc.) can read it.
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const PREMIUM_PREFIX = "pulse_premium_";

function premiumKey(uid) {
  return PREMIUM_PREFIX + uid;
}
function isPremium(uid) {
  return !!uid && localStorage.getItem(premiumKey(uid)) === "active";
}
function setPremium(uid, active) {
  if (!uid) return;
  if (active) localStorage.setItem(premiumKey(uid), "active");
  else localStorage.removeItem(premiumKey(uid));
  // Let nav-auth.js (and anything else listening) know right away —
  // localStorage's own "storage" event only fires in *other* tabs.
  window.dispatchEvent(new CustomEvent("pulse:premium-changed"));
}

let currentUser = null;

// ── DOM refs ────────────────────────────────────────────────────
let banner,
  freeBtn,
  upgradeBtn,
  planPremiumCard,
  planFreeCard,
  paymentModal,
  paymentClose,
  paymentForm,
  viewForm,
  viewProcessing,
  viewSuccess,
  paymentDoneBtn,
  loginModal,
  loginClose,
  cancelModal,
  cancelClose,
  cancelConfirmBtn,
  cardNumberInput;

function init() {
  banner = document.getElementById("current-plan-banner");
  freeBtn = document.getElementById("btn-free");
  upgradeBtn = document.getElementById("btn-upgrade");
  planPremiumCard = document.getElementById("plan-premium");
  planFreeCard = document.getElementById("plan-free");

  paymentModal = document.getElementById("payment-modal");
  paymentClose = document.getElementById("payment-close");
  paymentForm = document.getElementById("payment-form");
  viewForm = document.getElementById("payment-view-form");
  viewProcessing = document.getElementById("payment-view-processing");
  viewSuccess = document.getElementById("payment-view-success");
  paymentDoneBtn = document.getElementById("payment-done");

  loginModal = document.getElementById("login-required-modal");
  loginClose = document.getElementById("login-required-close");

  cancelModal = document.getElementById("cancel-modal");
  cancelClose = document.getElementById("cancel-modal-close");
  cancelConfirmBtn = document.getElementById("cancel-confirm-btn");

  cardNumberInput = document.getElementById("card-number");

  upgradeBtn.addEventListener("click", onUpgradeClick);
  freeBtn.addEventListener("click", onFreeClick);

  paymentClose.addEventListener("click", () => closeModal(paymentModal));
  paymentModal.addEventListener("click", (e) => {
    if (e.target === paymentModal) closeModal(paymentModal);
  });
  paymentForm.addEventListener("submit", onPaymentSubmit);
  paymentDoneBtn.addEventListener("click", () => {
    closeModal(paymentModal);
    render();
  });

  loginClose.addEventListener("click", () => closeModal(loginModal));
  loginModal.addEventListener("click", (e) => {
    if (e.target === loginModal) closeModal(loginModal);
  });

  cancelClose.addEventListener("click", () => closeModal(cancelModal));
  cancelModal.addEventListener("click", (e) => {
    if (e.target === cancelModal) closeModal(cancelModal);
  });
  cancelConfirmBtn.addEventListener("click", () => {
    setPremium(currentUser.uid, false);
    closeModal(cancelModal);
    render();
  });

  // light card-number formatting (spaces every 4 digits) — cosmetic only
  cardNumberInput.addEventListener("input", () => {
    const digits = cardNumberInput.value.replace(/\D/g, "").slice(0, 16);
    cardNumberInput.value = digits.replace(/(.{4})/g, "$1 ").trim();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    [paymentModal, loginModal, cancelModal].forEach((m) => {
      if (m.classList.contains("open")) closeModal(m);
    });
  });

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    render();
  });
}

function openModal(modal) {
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeModal(modal) {
  modal.classList.remove("open");
  document.body.style.overflow = "";
}

function onUpgradeClick() {
  if (!currentUser) {
    openModal(loginModal);
    return;
  }
  if (isPremium(currentUser.uid)) return;
  resetPaymentModal();
  openModal(paymentModal);
}

function onFreeClick() {
  if (currentUser && isPremium(currentUser.uid)) {
    openModal(cancelModal);
  }
  // If already on free plan, the button is inert (current plan).
}

function resetPaymentModal() {
  paymentForm.reset();
  viewForm.classList.remove("hidden");
  viewProcessing.classList.add("hidden");
  viewSuccess.classList.add("hidden");
}

function onPaymentSubmit(e) {
  e.preventDefault();
  viewForm.classList.add("hidden");
  viewProcessing.classList.remove("hidden");

  // Simulated processing delay — no real charge occurs.
  setTimeout(() => {
    if (currentUser) setPremium(currentUser.uid, true);
    viewProcessing.classList.add("hidden");
    viewSuccess.classList.remove("hidden");
  }, 1400);
}

function render() {
  const premium = currentUser && isPremium(currentUser.uid);

  if (!currentUser) {
    banner.innerHTML = `Bạn đang xem với tư cách khách. <a href="login.html">Đăng nhập</a> để nâng cấp lên Premium.`;
    planPremiumCard.classList.remove("current-plan");
    freeBtn.textContent = "Gói Hiện Tại";
    freeBtn.classList.remove("cta-active");
    upgradeBtn.disabled = false;
    upgradeBtn.textContent = "Nâng Cấp Ngay";
    return;
  }

  if (premium) {
    banner.innerHTML = `Bạn đang sử dụng gói Premium`;
    planPremiumCard.classList.add("current-plan");
    upgradeBtn.disabled = true;
    upgradeBtn.textContent = "Gói Hiện Tại";
    freeBtn.textContent = "Hủy Premium";
    freeBtn.classList.add("cta-active");
  } else {
    banner.innerHTML = `Bạn đang sử dụng gói Miễn Phí`;
    planPremiumCard.classList.remove("current-plan");
    upgradeBtn.disabled = false;
    upgradeBtn.textContent = "Nâng Cấp Ngay";
    freeBtn.textContent = "Gói Hiện Tại";
    freeBtn.classList.remove("cta-active");
  }
}

document.addEventListener("DOMContentLoaded", init);
