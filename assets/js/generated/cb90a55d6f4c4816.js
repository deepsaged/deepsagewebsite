
const authMode = "signup";

function openAuthModal() {
  setAuthMsg("");
  document.getElementById("auth-modal-overlay").style.display = "flex";
}

function closeAuthModal() {
  document.getElementById("auth-modal-overlay").style.display = "none";
}

function setAuthMsg(txt, color) {
  const el = document.getElementById("auth-msg");
  el.textContent = txt;
  el.style.color = color || "#ff6688";
}

async function authSubmit() {
  const sf = window._sf;
  if (!sf) return setAuthMsg(window.dsUiStrings.firebase_not_ready);
  const email = document.getElementById("auth-email").value.trim();
  const pass = document.getElementById("auth-pass").value;
  if (!email || !pass) return setAuthMsg(window.dsUiStrings.fill_all_fields);

  if (authMode === "signup" && !document.getElementById("auth-consent-check").checked) {
    return setAuthMsg(window.dsUiStrings.tick_consent);
  }

  const btn = document.getElementById("auth-submit-btn");
  btn.textContent = "…";
  btn.disabled = true;

  try {
    if (authMode === "signin") {
      await sf.signInWithEmailAndPassword(sf.auth, email, pass);
    } else {
      const cred = await sf.createUserWithEmailAndPassword(sf.auth, email, pass);
      await sf.recordUserSignup(cred.user, true);
    }
    setAuthMsg("");
    closeAuthModal();
  } catch (err) {
    const msgs = {
      "auth/user-not-found": window.dsUiStrings.auth_err_user_not_found,
      "auth/wrong-password": window.dsUiStrings.auth_err_wrong_password,
      "auth/invalid-credential": window.dsUiStrings.auth_err_invalid_credential,
      "auth/email-already-in-use": window.dsUiStrings.auth_err_email_in_use,
      "auth/weak-password": window.dsUiStrings.auth_err_weak_password,
      "auth/invalid-email": window.dsUiStrings.auth_err_invalid_email,
    };
    setAuthMsg(msgs[err.code] || err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = window.dsUiStrings.join_wishlist;
  }
}

async function authGoogle() {
  const sf = window._sf;
  if (!sf) return setAuthMsg(window.dsUiStrings.firebase_not_ready);
  if (authMode === "signup" && !document.getElementById("auth-consent-check").checked) {
    return setAuthMsg(window.dsUiStrings.tick_consent);
  }
  try {
    const result = await sf.signInWithPopup(sf.auth, sf.gProvider);
    const info = sf.getAdditionalUserInfo(result);
    await sf.recordUserSignup(result.user, !!(info && info.isNewUser));
    closeAuthModal();
  } catch (err) {
    if (err.code !== "auth/popup-closed-by-user") setAuthMsg(err.message);
  }
}

async function connectPlatform(providerName) {
  const sf = window._sf;
  const user = sf && sf.auth.currentUser;
  if (!user) return;

  const btn = document.getElementById(`connect-${providerName}-btn`);
  const prevText = btn.textContent;
  btn.disabled = true;
  btn.textContent = window.dsUiStrings.connecting;

  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`https://oauth.deepsage.com/auth/${providerName}/login`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) throw new Error(window.dsUiStrings.could_not_connect);
    const { url } = await res.json();
    window.location.href = url;
  } catch (err) {
    btn.disabled = false;
    btn.textContent = prevText;
  }
}

async function doSignOut() {
  const sf = window._sf;
  if (sf) await sf.signOut(sf.auth);
  document.getElementById("account-dropdown").classList.remove("open");
}

function toggleAccountMenu() {
  document.getElementById("account-dropdown").classList.toggle("open");
}

document.addEventListener("click", function(e) {
  const menu = document.getElementById("header-auth-in");
  const dropdown = document.getElementById("account-dropdown");
  if (menu && dropdown && !menu.contains(e.target)) {
    dropdown.classList.remove("open");
  }
});

/* ── Cookie consent management (site-wide) ── */
(function() {
  const CONSENT_KEY = 'deepsage_cookie_consent';
  const CONSENT_EXPIRY = 12 * 30 * 24 * 60 * 60 * 1000; // 12 months

  function getStoredConsent() {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) return null;
    try {
      const consent = JSON.parse(stored);
      const now = Date.now();
      if (now - consent.timestamp > CONSENT_EXPIRY) {
        localStorage.removeItem(CONSENT_KEY);
        return null;
      }
      return consent;
    } catch (error) {
      console.error("Invalid consent data:", error);
      localStorage.removeItem(CONSENT_KEY);
      return null;
    }
  }

  function saveConsent(essential, analytics, marketing) {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({
      essential: true, analytics, marketing, timestamp: Date.now(),
    }));
  }

  // Tri-state referral handling (2026-08-30): the ds_ref_staged cookie
  // (staged unconditionally by stageReferralCookie() up in <head>, regardless
  // of consent) only ever gets read here, at the moment consent is actually
  // decided -- accepting promotes it into the ds_pending_* localStorage keys
  // recordUserSignup() reads; declining deletes it outright; no decision yet
  // leaves it staged and simply unused. Called from
  // loadCookiesBasedOnConsent() below, the single choke point both paths
  // (page-load-with-stored-consent, and the banner/modal buttons) already
  // go through.
  var REF_COOKIE = 'ds_ref_staged';

  function promoteStagedReferralIfConsented() {
    var FLAG = 'ds_attribution_captured';
    if (localStorage.getItem(FLAG)) return; // only ever promoted once per browser
    var staged = window.dsGetCookie(REF_COOKIE);
    if (!staged) return;
    var data;
    try {
      data = JSON.parse(staged);
    } catch (e) {
      return;
    }
    localStorage.setItem('ds_pending_ref', data.ref || '');
    localStorage.setItem('ds_pending_utm_source', data.utm_source || '');
    localStorage.setItem('ds_pending_utm_medium', data.utm_medium || '');
    localStorage.setItem('ds_pending_utm_campaign', data.utm_campaign || '');
    localStorage.setItem('ds_pending_utm_content', data.utm_content || '');
    localStorage.setItem('ds_pending_referrer', data.referrer || '');
    localStorage.setItem('ds_pending_landing', data.landing || '');
    localStorage.setItem('ds_pending_first_visit_at', data.first_visit_at || '');
    localStorage.setItem(FLAG, '1');
  }

  function loadCookiesBasedOnConsent(consent) {
    window.dsAnalyticsConsent = !!consent.analytics;
    gtag('consent', 'update', {
      'analytics_storage': consent.analytics ? 'granted' : 'denied',
      'ad_storage': consent.marketing ? 'granted' : 'denied',
      'ad_user_data': consent.marketing ? 'granted' : 'denied',
      'ad_personalization': consent.marketing ? 'granted' : 'denied',
    });
    if (consent.analytics) {
      promoteStagedReferralIfConsented();
    } else {
      window.dsDeleteCookie(REF_COOKIE);
    }
  }

  function initializeCookieBanner() {
    const storedConsent = getStoredConsent();
    const banner = document.getElementById('cookieBanner');
    if (!banner) return;

    if (!storedConsent) {
      banner.classList.add('show');
    } else {
      banner.classList.remove('show');
      loadCookiesBasedOnConsent(storedConsent);
    }
  }

  document.getElementById('cookieAccept').addEventListener('click', function() {
    saveConsent(true, true, true);
    loadCookiesBasedOnConsent({ essential: true, analytics: true, marketing: true });
    document.getElementById('cookieBanner').classList.remove('show');
  });

  document.getElementById('cookieReject').addEventListener('click', function() {
    saveConsent(true, false, false);
    loadCookiesBasedOnConsent({ essential: true, analytics: false, marketing: false });
    document.getElementById('cookieBanner').classList.remove('show');
  });

  document.getElementById('cookieCustomize').addEventListener('click', function() {
    const storedConsent = getStoredConsent();
    if (storedConsent) {
      document.getElementById('cookieAnalytics').checked = storedConsent.analytics;
      document.getElementById('cookieMarketing').checked = storedConsent.marketing;
    }
    document.getElementById('cookieModal').classList.add('show');
  });

  document.getElementById('cookieModalCancel').addEventListener('click', function() {
    document.getElementById('cookieModal').classList.remove('show');
  });

  document.getElementById('cookieModalSave').addEventListener('click', function() {
    const analytics = document.getElementById('cookieAnalytics').checked;
    const marketing = document.getElementById('cookieMarketing').checked;
    saveConsent(true, analytics, marketing);
    loadCookiesBasedOnConsent({ essential: true, analytics, marketing });
    document.getElementById('cookieModal').classList.remove('show');
    document.getElementById('cookieBanner').classList.remove('show');
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      const modal = document.getElementById('cookieModal');
      if (modal.classList.contains('show')) {
        document.getElementById('cookieModalCancel').click();
      }
    }
  });

  document.addEventListener('DOMContentLoaded', initializeCookieBanner);
})();

/* ── Share button click tracking (site-wide, event delegation) ── */
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.share-btn');
  if (!btn) return;
  let method = 'twitter';
  if (btn.href.indexOf('facebook.com') !== -1) method = 'facebook';
  else if (btn.href.indexOf('linkedin.com') !== -1) method = 'linkedin';
  const contentType = location.pathname.startsWith('/quiz/') ? 'quiz'
    : location.pathname.startsWith('/article/') ? 'article' : 'other';
  window.dsTrack('share', { method, content_type: contentType, item_id: location.pathname });
});

/* ── Language preference resolution (site-wide) ── */
function toggleLangMenu() {
  var dd = document.getElementById('lang-dropdown');
  if (dd) dd.classList.toggle('open');
}

document.addEventListener('click', function (e) {
  var dropdown = document.getElementById('lang-dropdown');
  var switcher = document.querySelector('.lang-switcher');
  if (dropdown && switcher && !switcher.contains(e.target)) dropdown.classList.remove('open');
});

function dsPersistLangOverride(lang) {
  localStorage.setItem('deepsage_lang', lang);
  var sf = window._sf;
  var user = sf && sf.auth.currentUser;
  if (user && sf.setPreferredLang) {
    sf.setPreferredLang(user.uid, lang).catch(function (err) {
      console.error('Failed to save language preference:', err);
    });
  }
}
window.dsPersistLangOverride = dsPersistLangOverride;

function dsSwitchLang(event, lang, url) {
  // NOTE: this duplicates the localStorage write from dsPersistLangOverride
  // (kept above, unchanged) because dsSwitchLang needs to await the Firestore
  // write before navigating, while dsPersistLangOverride is a fire-and-forget
  // helper used by the settings page (Task 4, templates/settings.html's
  // dsSettingsChangeLang), which navigates on its own right after calling it.
  localStorage.setItem('deepsage_lang', lang);
  var sf = window._sf;
  var user = sf && sf.auth.currentUser;
  if (user && sf.setPreferredLang) {
    event.preventDefault();
    // Firestore writes can hang indefinitely (e.g. retrying with backoff
    // against a misconfigured/unreachable database) instead of ever
    // resolving or rejecting, which would leave the user stuck on the page
    // forever. Race against a timeout so navigation always happens even if
    // the preference write never settles.
    var navigated = false;
    function navigate() {
      if (navigated) return;
      navigated = true;
      window.location.href = url;
    }
    sf.setPreferredLang(user.uid, lang)
      .catch(function (err) { console.error('Failed to save language preference:', err); })
      .finally(navigate);
    setTimeout(navigate, 1500);
    return false;
  }
  return true;
}
window.dsSwitchLang = dsSwitchLang;

var dsLangResolved = false;
window.dsOnAuthReady = function (user) {
  if (dsLangResolved) return;
  dsLangResolved = true;
  if (!window.DsLangPreference || !window.dsLangUrls || Object.keys(window.dsLangUrls).length === 0) return;

  var storedOverride = localStorage.getItem('deepsage_lang');
  var browserLang = navigator.language;

  function apply(firestorePref) {
    var result = window.DsLangPreference.resolveRedirect({
      currentLang: window.dsCurrentLang,
      langUrls: window.dsLangUrls,
      storedOverride: storedOverride,
      firestorePref: firestorePref || null,
      browserLang: browserLang,
    });
    if (!result) return;
    // Guard against redirecting to the page the visitor is already on (e.g.
    // a casing mismatch between currentLang and a lang_urls key, or a
    // trailing-slash inconsistency) -- without this, a data mismatch could
    // send the visitor into a same-page redirect loop.
    if (result.url === window.location.pathname || result.url === window.location.href) return;
    if (result.persistOverride) localStorage.setItem('deepsage_lang', result.lang);
    // Use replace(), not `.href =`, because this is an automatic redirect
    // the visitor never asked for (either the Firestore-preference tier, or
    // the browser-auto-detect tier, which by design never persists and so
    // re-fires on every page load). `.href =` would push a new history
    // entry each time, trapping Back-button presses by immediately
    // re-redirecting forward again. Explicit user-initiated switches
    // (dsSwitchLang, dsSettingsChangeLang) intentionally keep using
    // `.href =` since those SHOULD be normal, back-button-able navigations.
    window.location.replace(result.url);
  }

  var sf = window._sf;
  if (user && sf && sf.getPreferredLang) {
    sf.getPreferredLang(user.uid).then(apply).catch(function () { apply(null); });
  } else {
    apply(null);
  }
};

// Fallback for when Firebase Auth never calls back at all (CDN blocked,
// offline, script failed to load). This is a timer, not a DOMContentLoaded
// listener, on purpose: this inline <script> runs near the bottom of
// <body>, so DOMContentLoaded fires essentially immediately after it
// registers -- long before Firebase's first onAuthStateChanged callback
// (an unconditionally async, IndexedDB-backed read) has any real chance to
// resolve. Since dsOnAuthReady is latched to only run once (dsLangResolved),
// firing on DOMContentLoaded would deterministically win the race on every
// normal page load and permanently blind language resolution to a logged-in
// user's Firestore preferredLang -- the real Firebase callback would arrive
// later and be silently ignored. 3000ms is generous: a working IndexedDB
// read typically resolves in well under 100ms, so in the overwhelmingly
// common case Firebase claims the latch long before this timer fires, and
// this fallback only actually matters when Firebase never calls back at
// all -- in which case treating the visitor as logged-out for
// language-resolution purposes (falling through to localStorage override /
// browser auto-detect, neither of which need Firebase) is the correct
// degraded behavior. 3s is still well under what a user would notice as a
// late background redirect.
setTimeout(function () {
  if (window.dsOnAuthReady) window.dsOnAuthReady(null);
}, 3000);
