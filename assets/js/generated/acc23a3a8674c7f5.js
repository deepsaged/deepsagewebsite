
  window.dsSettingsStrings = {"connect_button": "\u8fde\u63a5", "data_delete_prompt": "\u8fd9\u5c06\u6c38\u4e45\u5220\u9664\u4f60\u7684\u8d26\u6237\u3001\u5fc3\u613f\u5355\u3001\u90ae\u4ef6\u8ba2\u9605\u548c\u6d4b\u8bd5\u7248\u6570\u636e\u3002\u8bf7\u8f93\u5165 DELETE \u4ee5\u786e\u8ba4\u3002", "data_deleted": "\u4f60\u7684\u8d26\u6237\u548c\u6570\u636e\u5df2\u5220\u9664\u3002\u6211\u4eec\u670d\u52a1\u5546\u5904\u7684\u526f\u672c\u4f1a\u5728\u4e00\u5c0f\u65f6\u5185\u5220\u9664\u3002", "data_error_prefix": "\u65e0\u6cd5\u5b8c\u6210\u8bf7\u6c42\uff1a", "email_pending": "\u8bf7\u67e5\u6536\u786e\u8ba4\u90ae\u4ef6", "email_status_error_prefix": "\u65e0\u6cd5\u52a0\u8f7d\u90ae\u4ef6\u72b6\u6001: ", "email_subscribe_button": "\u8ba2\u9605", "email_subscribed": "\u5df2\u8ba2\u9605", "email_unsubscribe_button": "\u53d6\u6d88\u8ba2\u9605", "email_unsubscribed": "\u672a\u8ba2\u9605", "oauth_error_prefix": "\u8fde\u63a5\u5931\u8d25\uff1a", "oauth_success_prefix": "\u5df2\u8fde\u63a5\u3002", "oauth_success_suffix": "\u6210\u529f\u5730\u3002", "reconnect_button": "\u91cd\u65b0\u8fde\u63a5\u3002", "status_connected": "\u5df2\u8fde\u63a5\u3002", "status_error_prefix": "\u65e0\u6cd5\u52a0\u8f7d\u8d26\u6237\u72b6\u6001\uff1a", "status_not_connected": "\u672a\u8fde\u63a5\u3002"};

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
      applyEmailDigestState(data, statusEl, btn);
    } catch (err) {
      settingsShowMsg(`${window.dsSettingsStrings.email_status_error_prefix}${err.message}`, true);
    }
  }

  // docs/sdd/2026-10-05-email-opt-in-ui.md, REQ-EU3: subscribed (confirmed),
  // pending (waiting for the confirmation email click) or unsubscribed.
  // The button turns the request on, or off (including cancelling a pending one).
  function applyEmailDigestState(data, statusEl, btn) {
    const active = !!(data.subscribed || data.pending);
    if (data.subscribed) {
      statusEl.textContent = window.dsSettingsStrings.email_subscribed;
      statusEl.classList.add("connected");
    } else if (data.pending) {
      statusEl.textContent = window.dsSettingsStrings.email_pending;
      statusEl.classList.remove("connected");
    } else {
      statusEl.textContent = window.dsSettingsStrings.email_unsubscribed;
      statusEl.classList.remove("connected");
    }
    btn.textContent = active ? window.dsSettingsStrings.email_unsubscribe_button : window.dsSettingsStrings.email_subscribe_button;
    btn.dataset.subscribed = active ? "true" : "false";
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
        body: JSON.stringify({ subscribed: nextSubscribed, source: "settings" }),
      });
      const data = await res.json();
      applyEmailDigestState(data, statusEl, btn);
    } catch (err) {
      settingsShowMsg(`${window.dsSettingsStrings.email_status_error_prefix}${err.message}`, true);
    }
  }

  async function downloadMyData() {
    const sf = window._sf;
    const user = sf && sf.auth.currentUser;
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("https://oauth.deepsage.com/api/account/export", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = {
        generated_at: new Date().toISOString(),
        account: {
          uid: user.uid,
          email: user.email,
          email_verified: user.emailVerified,
          display_name: user.displayName,
          providers: user.providerData.map((p) => p.providerId),
          created: user.metadata.creationTime,
          last_sign_in: user.metadata.lastSignInTime,
        },
        profile: await sf.getUserProfile(user.uid),
        deepsage_database: await res.json(),
        info: "What we do with this data and for how long: https://deepsage.com/privacy-policy/",
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `deepsage-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      settingsShowMsg(`${window.dsSettingsStrings.data_error_prefix}${err.message}`, true);
    }
  }

  async function deleteMyAccount() {
    const sf = window._sf;
    const user = sf && sf.auth.currentUser;
    if (!user) return;
    const typed = prompt(window.dsSettingsStrings.data_delete_prompt);
    if ((typed || "").trim().toUpperCase() !== "DELETE") return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("https://oauth.deepsage.com/api/account/delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Deleting in the browser needs a recent sign-in; if it fails, the
      // privacy job deletes the Firebase account within the hour.
      try {
        await sf.deleteUser(user);
      } catch (err) {
        console.warn("browser-side account deletion deferred to server", err);
      }
      try { await sf.signOut(sf.auth); } catch (err) { /* already gone */ }
      settingsShowMsg(window.dsSettingsStrings.data_deleted);
    } catch (err) {
      settingsShowMsg(`${window.dsSettingsStrings.data_error_prefix}${err.message}`, true);
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
