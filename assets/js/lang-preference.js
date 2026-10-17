(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.DsLangPreference = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var SUPPORTED_LANGS = ['en', 'es', 'pt', 'fr', 'de', 'ru', 'ja', 'zh-Hans', 'ko', 'it', 'hi'];

  // Matches navigatorLanguage (e.g. "es-MX", "zh-CN") against the language
  // codes actually present in langUrls -- exact code match first, then a
  // primary-subtag match (e.g. "zh-CN" -> "zh-Hans", "pt-BR" -> "pt").
  function pickBrowserLang(navigatorLanguage, langUrls) {
    if (!navigatorLanguage || !langUrls) return null;
    var lower = navigatorLanguage.toLowerCase();
    var keys = Object.keys(langUrls);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === lower) return keys[i];
    }
    var primary = lower.split('-')[0];
    for (var j = 0; j < keys.length; j++) {
      if (keys[j].toLowerCase().split('-')[0] === primary) return keys[j];
    }
    return null;
  }

  // Decides whether to redirect the visitor to a different language version
  // of the current page, and to which one. Priority: Firestore preference
  // (logged-in, highest) > explicit localStorage override > browser
  // auto-detect (lowest, never itself persisted). If the winning signal's
  // language has no sibling for this page (missing from langUrls), this
  // returns null rather than falling through to a weaker signal -- an
  // explicit or account-level choice that doesn't apply here should not be
  // silently overridden by guesswork.
  function resolveRedirect(opts) {
    var currentLang = opts.currentLang;
    var langUrls = opts.langUrls || {};
    var firestorePref = opts.firestorePref;
    var storedOverride = opts.storedOverride;
    var browserLang = opts.browserLang;

    if (firestorePref) {
      if (firestorePref === currentLang) return null;
      if (langUrls[firestorePref]) {
        return { url: langUrls[firestorePref], lang: firestorePref, persistOverride: true };
      }
      return null;
    }

    if (storedOverride) {
      if (storedOverride === currentLang) return null;
      if (langUrls[storedOverride]) {
        return { url: langUrls[storedOverride], lang: storedOverride, persistOverride: false };
      }
      return null;
    }

    var matched = pickBrowserLang(browserLang, langUrls);
    if (matched && matched !== currentLang) {
      return { url: langUrls[matched], lang: matched, persistOverride: false };
    }
    return null;
  }

  return {
    SUPPORTED_LANGS: SUPPORTED_LANGS,
    pickBrowserLang: pickBrowserLang,
    resolveRedirect: resolveRedirect,
  };
});
