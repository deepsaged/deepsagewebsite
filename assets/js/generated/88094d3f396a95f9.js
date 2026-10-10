
  window.dsSettingsStrings = {"connect_button": "\uc5f0\uacb0\ud558\ub2e4", "data_delete_prompt": "\uacc4\uc815, \uc704\uc2dc\ub9ac\uc2a4\ud2b8, \uc774\uba54\uc77c \uad6c\ub3c5, \ubca0\ud0c0 \ub370\uc774\ud130\uac00 \uc601\uad6c\uc801\uc73c\ub85c \uc0ad\uc81c\ub429\ub2c8\ub2e4. \ud655\uc778\ud558\ub824\uba74 DELETE\ub97c \uc785\ub825\ud558\uc138\uc694.", "data_deleted": "\uacc4\uc815\uacfc \ub370\uc774\ud130\uac00 \uc0ad\uc81c\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \uc11c\ube44\uc2a4 \uc81c\uacf5\uc5c5\uccb4\uc5d0 \uc788\ub294 \uc0ac\ubcf8\uc740 1\uc2dc\uac04 \uc774\ub0b4\uc5d0 \uc0ad\uc81c\ub429\ub2c8\ub2e4.", "data_error_prefix": "\uc694\uccad\uc744 \uc644\ub8cc\ud558\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4: ", "email_pending": "\ubc1b\uc740\ud3b8\uc9c0\ud568\uc5d0\uc11c \ud655\uc778 \uc774\uba54\uc77c\uc744 \ud655\uc778\ud558\uc138\uc694", "email_status_error_prefix": "\uc774\uba54\uc77c \uc0c1\ud0dc\ub97c \ubd88\ub7ec\uc62c \uc218 \uc5c6\uc2b5\ub2c8\ub2e4: ", "email_subscribe_button": "\uad6c\ub3c5\ud558\uae30", "email_subscribed": "\uad6c\ub3c5 \uc911", "email_unsubscribe_button": "\uad6c\ub3c5 \ucde8\uc18c", "email_unsubscribed": "\uad6c\ub3c5 \uc548 \ud568", "oauth_error_prefix": "\uc5f0\uacb0\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.", "oauth_success_prefix": "\uc5f0\uacb0\ub428", "oauth_success_suffix": "\uc131\uacf5\uc801\uc73c\ub85c.", "reconnect_button": "\ub2e4\uc2dc \uc5f0\uacb0\ud558\ub2e4.", "status_connected": "\uc5f0\uacb0\ub428", "status_error_prefix": "\uacc4\uc815 \uc0c1\ud0dc\ub97c \ubd88\ub7ec\uc624\ub294 \ub370 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.", "status_not_connected": "\uc5f0\uacb0\ub418\uc9c0 \uc54a\uc74c"};

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
