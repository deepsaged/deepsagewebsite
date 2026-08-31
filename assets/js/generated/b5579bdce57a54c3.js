
  window.dsSettingsStrings = {"connect_button": "Conectar", "email_status_error_prefix": "N\u00e3o foi poss\u00edvel carregar o status do e-mail: ", "email_subscribe_button": "Inscrever-se", "email_subscribed": "Inscrito", "email_unsubscribe_button": "Cancelar inscri\u00e7\u00e3o", "email_unsubscribed": "N\u00e3o inscrito", "oauth_error_prefix": "Falha na conex\u00e3o:", "oauth_success_prefix": "Conectado(a)", "oauth_success_suffix": "com sucesso.", "reconnect_button": "Reconecte-se.", "status_connected": "Conectado(a)", "status_error_prefix": "N\u00e3o foi poss\u00edvel carregar o estado da conta:", "status_not_connected": "N\u00e3o conectado."};

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
