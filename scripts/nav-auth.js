import { auth } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const navAuth = document.getElementById("nav-auth");

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderGuest() {
  navAuth.innerHTML = `<a href="login.html" class="auth-btn">Đăng Nhập</a>`;
}

function renderUser(user) {
  const name = user.displayName || "bạn";
  const isPremium = localStorage.getItem(`pulse_premium_${user.uid}`) === "active";
  const badge = isPremium ? `<span class="premium-badge">Premium</span>` : "";
  navAuth.innerHTML = `
    <div class="user-menu">
      <span class="user-greeting">Xin chào, <strong>${escapeHtml(name)}</strong></span>
      ${badge}
      <button class="logout-btn" id="logout-btn">Đăng xuất</button>
    </div>`;

  document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  });
}

// Re-render using whatever Firebase currently reports as the signed-in user.
// Exposed so other scripts (e.g. premium.js) can ask the nav to refresh
// immediately after the user's premium status changes, without needing
// a full page reload or an actual auth state change.
function refreshNavAuth() {
  const user = auth.currentUser;
  if (user) renderUser(user);
  else renderGuest();
}

onAuthStateChanged(auth, (user) => {
  if (user) renderUser(user);
  else renderGuest();
});

window.addEventListener("pulse:premium-changed", refreshNavAuth);

