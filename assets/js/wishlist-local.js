// Local wishlist (docs/sdd/2026-11-07-local-wishlist-and-release-banner.md).
// No account and no server: the list lives in this browser only, in
// localStorage plus a long-lived cookie that mirrors it (so clearing one
// store does not lose the list). The only thing that leaves the browser is
// the GA4 `add_to_wishlist` / `remove_from_wishlist` event, through dsTrack
// (consent-gated). A wishlisted item that has been released replaces the
// default top banner with a random one of those items.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.DsLocalWishlist = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var LIST_KEY = 'ds_wishlist_v1';
  var DISMISSED_KEY = 'ds_wishlist_banner_dismissed';
  var COOKIE = 'ds_wl';
  var COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // browsers cap cookie lifetime at 400 days
  var ITEM_RE = /^(game|book):[a-z0-9-]{1,80}$/;

  function isValidItemId(id) {
    return typeof id === 'string' && ITEM_RE.test(id);
  }

  function clean(ids) {
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      if (isValidItemId(ids[i]) && out.indexOf(ids[i]) === -1) out.push(ids[i]);
    }
    return out;
  }

  function readJson(storage, key) {
    try {
      var v = JSON.parse(storage.getItem(key));
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }

  function readCookie(doc) {
    var m = (doc.cookie || '').match(new RegExp('(?:^|; )' + COOKIE + '=([^;]*)'));
    if (!m) return [];
    try {
      return decodeURIComponent(m[1]).split(',');
    } catch (e) {
      return [];
    }
  }

  // The union of both stores, so an item survives losing either one.
  function load(storage, doc) {
    return clean(readJson(storage, LIST_KEY).concat(readCookie(doc)));
  }

  function save(storage, doc, ids) {
    ids = clean(ids);
    try { storage.setItem(LIST_KEY, JSON.stringify(ids)); } catch (e) { /* private mode */ }
    doc.cookie = COOKIE + '=' + encodeURIComponent(ids.join(',')) + '; max-age=' + COOKIE_MAX_AGE + '; path=/; SameSite=Lax';
    return ids;
  }

  function loadDismissed(storage) {
    return clean(readJson(storage, DISMISSED_KEY));
  }

  // released: [{id, kind, title, url}] built into the page. Random among the
  // wishlisted, released and not dismissed items; null when there is none
  // (the page then keeps its default banner).
  function pickBanner(wishlist, released, dismissed, rng) {
    var pool = [];
    for (var i = 0; i < released.length; i++) {
      var r = released[i];
      if (wishlist.indexOf(r.id) !== -1 && dismissed.indexOf(r.id) === -1) pool.push(r);
    }
    if (!pool.length) return null;
    return pool[Math.floor((rng || Math.random)() * pool.length) % pool.length];
  }

  function track(name, id) {
    if (typeof window === 'undefined' || !window.dsTrack) return;
    var parts = id.split(':');
    window.dsTrack(name, { item_id: id, item_kind: parts[0], item_slug: parts[1] });
  }

  // Page glue: button state, click handling, banner swap.
  function init(doc, win) {
    var strings = win.dsWishlistStrings || { add: 'Add to wishlist', added: 'On wishlist' };
    var list = load(win.localStorage, doc);
    save(win.localStorage, doc, list); // re-mirror into the store that lost it

    function renderButtons() {
      var buttons = doc.querySelectorAll('[data-wishlist-item]');
      for (var i = 0; i < buttons.length; i++) {
        var on = list.indexOf(buttons[i].dataset.wishlistItem) !== -1;
        buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        buttons[i].textContent = on ? strings.added : strings.add;
      }
    }

    function renderBanner() {
      var banner = doc.getElementById('topBanner');
      var data = win.dsReleasedItems;
      if (!banner || !data) return;
      var pick = pickBanner(list, data.items || [], loadDismissed(win.localStorage));
      if (!pick) return;
      var text = banner.querySelector('.top-banner-text');
      var cta = banner.querySelector('.top-banner-cta');
      if (cta) cta.style.display = 'none';
      var link = doc.createElement('a');
      link.className = 'top-banner-link';
      link.href = pick.url;
      link.textContent = pick.title;
      link.addEventListener('click', function () {
        if (win.dsTrack) win.dsTrack('wishlist_banner_click', { item_id: pick.id, item_kind: pick.kind });
      });
      var close = doc.createElement('button');
      close.type = 'button';
      close.className = 'top-banner-close';
      close.setAttribute('aria-label', data.dismiss);
      close.textContent = '×';
      close.addEventListener('click', function () {
        var dismissed = loadDismissed(win.localStorage);
        dismissed.push(pick.id);
        try { win.localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed)); } catch (e) { /* private mode */ }
        banner.style.display = 'none';
      });
      text.textContent = '';
      text.appendChild(link);
      text.appendChild(doc.createTextNode(pick.kind === 'book' ? data.book : data.game));
      banner.appendChild(close);
      if (win.dsTrack) win.dsTrack('wishlist_banner_view', { item_id: pick.id, item_kind: pick.kind });
    }

    doc.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-wishlist-item]');
      if (!btn) return;
      e.preventDefault();
      var id = btn.dataset.wishlistItem;
      if (!isValidItemId(id)) return;
      var on = list.indexOf(id) === -1;
      list = on ? list.concat([id]) : list.filter(function (x) { return x !== id; });
      save(win.localStorage, doc, list);
      renderButtons();
      track(on ? 'add_to_wishlist' : 'remove_from_wishlist', id);
    });

    renderButtons();
    renderBanner();
  }

  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { init(document, window); });
    } else {
      init(document, window);
    }
  }

  return { isValidItemId: isValidItemId, load: load, save: save, pickBanner: pickBanner, loadDismissed: loadDismissed };
});
