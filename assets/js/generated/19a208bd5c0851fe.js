
  window.dsSettingsStrings = {"connect_button": "\u63a5\u7d9a\u3059\u308b", "email_status_error_prefix": "\u30e1\u30fc\u30eb\u306e\u72b6\u614b\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3067\u3057\u305f: ", "email_subscribe_button": "\u8cfc\u8aad\u3059\u308b", "email_subscribed": "\u8cfc\u8aad\u4e2d", "email_unsubscribe_button": "\u8cfc\u8aad\u89e3\u9664", "email_unsubscribed": "\u672a\u8cfc\u8aad", "oauth_error_prefix": "\u63a5\u7d9a\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002", "oauth_success_prefix": "\u63a5\u7d9a\u6e08\u307f", "oauth_success_suffix": "\u6210\u529f\u88cf\u306b\u3002", "reconnect_button": "\u518d\u63a5\u7d9a\u3059\u308b", "status_connected": "\u63a5\u7d9a\u6e08\u307f", "status_error_prefix": "\u30a2\u30ab\u30a6\u30f3\u30c8\u306e\u72b6\u614b\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3067\u3057\u305f\u3002", "status_not_connected": "\u63a5\u7d9a\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002"};

  const SETTINGS_PROVIDERS = ["instagram", "tiktok", "youtube", "threads"];

  function settingsShowMsg(text, isError) {
    const el = document.getElementById("settings-msg");
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? "#e5534b" : "";
  }

  function dsSettingsChangeLang(lang) {
    var select = document.getElementById('lang-select');
    var option = select.querySelector('option[value="' + lang + '"]');
    if (!option) return;
    var url = option.getAttribute('data-url');
    // Await the Firestore write before navigating (same race Task 3's
    // dsSwitchLang guards against: an unawaited write can be lost when the
    // page unloads, silently reverting the user's explicit choice on their
    // next visit). dsPersistLangOverride itself is fire-and-forget, so this
    // duplicates its localStorage write and does its own awaited Firestore
    // write rather than relying on it.
    localStorage.setItem('deepsage_lang', lang);
    var sf = window._sf;
    var user = sf && sf.auth.currentUser;
    if (user && sf.setPreferredLang) {
      sf.setPreferredLang(user.uid, lang)
        .catch(function (err) { console.error('Failed to save language preference:', err); })
        .finally(function () { window.location.href = url; });
      return;
    }
    window.location.href = url;
  }

  async function refreshConnectedStatus() {
    const sf = window._sf;
    const user = sf && sf.auth.currentUser;
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("https://oauth.deepsage.com/api/connected-accounts", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      const connected = new Set((data.connected || []).map((r) => r.provider));
      for (const provider of SETTINGS_PROVIDERS) {
        const statusEl = document.getElementById(`status-${provider}`);
        const btn = document.getElementById(`connect-${provider}-btn`);
        if (!statusEl || !btn) continue;
        if (connected.has(provider)) {
          statusEl.textContent = window.dsSettingsStrings.status_connected;
          statusEl.classList.add("connected");
          btn.textContent = window.dsSettingsStrings.reconnect_button;
        } else {
          statusEl.textContent = window.dsSettingsStrings.status_not_connected;
          statusEl.classList.remove("connected");
          btn.textContent = window.dsSettingsStrings.connect_button;
        }
      }
    } catch (err) {
      settingsShowMsg(`${window.dsSettingsStrings.status_error_prefix}${err.message}`, true);
    }
  }

  async function refreshEmailDigestStatus() {
    const sf = window._sf;
    const user = sf && sf.auth.currentUser;
    if (!user) return;
    const statusEl = document.getElementById("status-email-digest");
    const btn = document.getElementById("email-digest-toggle-btn");
    if (!statusEl || !btn) return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("https://oauth.deepsage.com/api/email-subscription", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      applyEmailDigestState(data.subscribed, statusEl, btn);
    } catch (err) {
      settingsShowMsg(`${window.dsSettingsStrings.email_status_error_prefix}${err.message}`, true);
    }
  }

  function applyEmailDigestState(subscribed, statusEl, btn) {
    if (subscribed) {
      statusEl.textContent = window.dsSettingsStrings.email_subscribed;
      statusEl.classList.add("connected");
      btn.textContent = window.dsSettingsStrings.email_unsubscribe_button;
    } else {
      statusEl.textContent = window.dsSettingsStrings.email_unsubscribed;
      statusEl.classList.remove("connected");
      btn.textContent = window.dsSettingsStrings.email_subscribe_button;
    }
    btn.dataset.subscribed = subscribed ? "true" : "false";
  }

  async function toggleEmailDigest() {
    const sf = window._sf;
    const user = sf && sf.auth.currentUser;
    if (!user) return;
    const statusEl = document.getElementById("status-email-digest");
    const btn = document.getElementById("email-digest-toggle-btn");
    const nextSubscribed = btn.dataset.subscribed !== "true";
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("https://oauth.deepsage.com/api/email-subscription", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ subscribed: nextSubscribed }),
      });
      const data = await res.json();
      applyEmailDigestState(data.subscribed, statusEl, btn);
    } catch (err) {
      settingsShowMsg(`${window.dsSettingsStrings.email_status_error_prefix}${err.message}`, true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "success") {
      settingsShowMsg(`${window.dsSettingsStrings.oauth_success_prefix}${params.get("provider") || ""}${window.dsSettingsStrings.oauth_success_suffix}`);
    } else if (params.get("oauth") === "error") {
      settingsShowMsg(`${window.dsSettingsStrings.oauth_error_prefix}${params.get("reason") || "unknown error"}`, true);
    }

    const signedOutPanel = document.getElementById("settings-signed-out");
    const signedInPanel = document.getElementById("settings-signed-in");
    const sf = window._sf;
    if (!sf) return;
    sf.onAuthStateChanged(sf.auth, (user) => {
      if (user) {
        signedOutPanel.style.display = "none";
        signedInPanel.style.display = "";
        refreshConnectedStatus();
        refreshEmailDigestStatus();
      } else {
        signedOutPanel.style.display = "";
        signedInPanel.style.display = "none";
      }
    });
  });
