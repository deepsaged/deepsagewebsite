/* Site engagement events for GA4 (docs/sdd/2026-10-19-engagement-events-and-deep-layout.md).
 * Everything goes through window.dsTrack, which sends nothing until the visitor allows analytics.
 * Params are page paths, link targets on our own pages or store hosts, and small enums: no personal data.
 *   scroll_depth       {percent, item_id, content_type}        once per 25/50/75/90
 *   read_complete      {item_id, content_type, seconds}        end of the article on screen after >= 30 s
 *   internal_click     {destination, link_type, item_id}       same-site link in the page body or rail
 *   game_page_click    {destination, item_id}                  /games/... or /launcher/
 *   game_install_click {destination, store, item_id}           store or download link, anywhere on the page
 * The smm/posting pipeline turns these into bandit rewards (pipeline_ga4_rewards.py, pipeline_article_rewards.py). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.DsEngagement = api;
    if (root.document) {
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', function () { api.init(root.document, root); });
      else api.init(root.document, root);
    }
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var THRESHOLDS = [25, 50, 75, 90];
  var READ_MIN_SECONDS = 30;
  var STORES = [
    [/(^|\.)play\.google\.com$/, 'google_play'],
    [/(^|\.)apps\.apple\.com$/, 'app_store'],
    [/(^|\.)store\.steampowered\.com$/, 'steam'],
    [/(^|\.)itch\.io$/, 'itch']
  ];

  function contentType(path) {
    return /^\/([a-z]{2}(-[A-Za-z]+)?\/)?quiz\//.test(path) ? 'quiz'
      : /^\/([a-z]{2}(-[A-Za-z]+)?\/)?article\//.test(path) ? 'article' : 'other';
  }

  function storeOf(url, isReleaseAsset) {
    if (isReleaseAsset || (url.host === 'github.com' && /\/releases\/download\//.test(url.pathname))) return 'launcher_download';
    for (var i = 0; i < STORES.length; i++) if (STORES[i][0].test(url.host)) return STORES[i][1];
    return null;
  }

  function linkType(el) {
    function inside(sel) { return el.closest && el.closest(sel); }
    if (inside('.deep-series, .deep-next')) return 'series';
    if (inside('.tag-chip-row, .tag-chip')) return 'tag';
    if (inside('.page-cta, .companion-cta')) return 'cta';
    if (inside('.page-rail')) return 'rail';
    if (inside('.deep-article')) return 'crosslink';
    return 'other';
  }

  /* What one click means, or null: game installs count anywhere; other same-site links only in the page body or rail. */
  function classifyClick(el, href, loc) {
    var url;
    try { url = new URL(href, loc.href); } catch (e) { return null; }
    var item = loc.pathname;
    var store = storeOf(url, el.hasAttribute && el.hasAttribute('data-release-asset'));
    if (store) return ['game_install_click', { destination: url.href, store: store, item_id: item }];
    if (url.host !== loc.host || !/^https?:$/.test(url.protocol)) return null;
    if (/^\/([a-z]{2}(-[A-Za-z]+)?\/)?(games|launcher)\//.test(url.pathname)) {
      return ['game_page_click', { destination: url.pathname, item_id: item }];
    }
    if (!(el.closest && el.closest('article, .page-rail, .deep-article'))) return null;    // header/footer nav is not engagement
    if (url.pathname === item) return null;                                                   // in-page anchors
    return ['internal_click', { destination: url.pathname, link_type: linkType(el), item_id: item }];
  }

  function newThresholds(percent, sent) {
    return THRESHOLDS.filter(function (t) { return percent >= t && !sent[t]; });
  }

  function init(doc, win) {
    var track = function (name, params) { if (typeof win.dsTrack === 'function') win.dsTrack(name, params); };
    var loc = win.location, item = loc.pathname, type = contentType(item), started = Date.now();
    doc.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var ev = classifyClick(a, a.getAttribute('href'), loc);
      if (ev) track(ev[0], ev[1]);
    }, true);
    if (type === 'other') return;
    var sent = {};
    function onScroll() {
      var h = doc.documentElement.scrollHeight - win.innerHeight;
      var pct = h > 0 ? 100 * (win.pageYOffset || 0) / h : 100;
      newThresholds(pct, sent).forEach(function (t) {
        sent[t] = true;
        track('scroll_depth', { percent: t, item_id: item, content_type: type });
      });
    }
    win.addEventListener('scroll', onScroll, { passive: true });
    var end = doc.querySelector('article .sources-list, article > :last-child');
    if (!end || !win.IntersectionObserver) return;
    var done = false;
    var seen = new win.IntersectionObserver(function (entries) {
      if (done || !entries.some(function (x) { return x.isIntersecting; })) return;
      var seconds = Math.round((Date.now() - started) / 1000);
      if (seconds < READ_MIN_SECONDS) return;                       // a skim to the bottom is not a read
      done = true;
      seen.disconnect();
      track('read_complete', { item_id: item, content_type: type, seconds: seconds });
    });
    seen.observe(end);
  }

  return { contentType: contentType, storeOf: storeOf, linkType: linkType, classifyClick: classifyClick,
           newThresholds: newThresholds, init: init, READ_MIN_SECONDS: READ_MIN_SECONDS };
});
