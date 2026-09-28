// Per-item wishlist buttons and the /wishlist/ page
// (docs/sdd/2026-09-27-games-books-wishlist.md, REQ-GB8/GB9). The list
// itself lives in the oauth worker (/api/wishlist). The pure controller is
// exported for node tests; the browser glue at the bottom wires it to the
// DOM, Firebase (via base.html's `ds-auth` event) and fetch.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.DsWishlist = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var ITEM_RE = /^(game|book):[a-z0-9-]{1,80}$/;
  var PENDING_KEY = 'ds_wishlist_pending';

  function isValidItemId(id) {
    return typeof id === 'string' && ITEM_RE.test(id);
  }

  // Joins the worker's rows with the page's catalog index, newest first.
  // Ids missing from the catalog (an item removed from the site) are skipped.
  function wishlistEntries(items, catalog) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var meta = catalog[items[i].item_id];
      if (!meta) continue;
      out.push({
        item_id: items[i].item_id, added_at: items[i].added_at,
        kind: meta.kind, title: meta.title, url: meta.url, image: meta.image,
      });
    }
    out.sort(function (a, b) { return a.added_at < b.added_at ? 1 : a.added_at > b.added_at ? -1 : 0; });
    return out;
  }

  // deps: api {list(), set(id, on)}, storage (localStorage-like), strings
  // {add, added}, getButtons(id?) -> button-likes, openAuth(), onError(),
  // onChange() (optional, after the list changes).
  function createController(deps) {
    var user = null;
    var items = [];

    function has(id) {
      for (var i = 0; i < items.length; i++) if (items[i].item_id === id) return true;
      return false;
    }

    function setLocal(id, on) {
      if (on && !has(id)) items.push({ item_id: id, added_at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
      if (!on) items = items.filter(function (it) { return it.item_id !== id; });
    }

    function render(id) {
      var buttons = deps.getButtons(id);
      for (var i = 0; i < buttons.length; i++) {
        var on = has(buttons[i].dataset.wishlistItem);
        buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        buttons[i].textContent = on ? deps.strings.added : deps.strings.add;
      }
      if (deps.onChange) deps.onChange();
    }

    async function onAuth(nextUser) {
      user = nextUser || null;
      items = [];
      if (user) {
        try {
          items = await deps.api.list();
        } catch (err) {
          items = [];
        }
        var pending = deps.storage.getItem(PENDING_KEY);
        deps.storage.removeItem(PENDING_KEY);
        if (isValidItemId(pending) && !has(pending)) {
          setLocal(pending, true);
          try {
            await deps.api.set(pending, true);
          } catch (err) {
            setLocal(pending, false);
            if (deps.onError) deps.onError(err);
          }
        }
      }
      render();
    }

    async function toggle(id, on) {
      setLocal(id, on);
      render(id);
      try {
        await deps.api.set(id, on);
      } catch (err) {
        setLocal(id, !on);
        render(id);
        if (deps.onError) deps.onError(err);
      }
    }

    async function click(button) {
      var id = button.dataset.wishlistItem;
      if (!isValidItemId(id)) return;
      if (!user) {
        deps.storage.setItem(PENDING_KEY, id);
        deps.openAuth();
        return;
      }
      await toggle(id, !has(id));
    }

    return {
      onAuth: onAuth, click: click, toggle: toggle, has: has,
      items: function () { return items.slice(); },
      signedIn: function () { return !!user; },
    };
  }

  // ── Browser glue ──
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    var API = 'https://oauth.deepsage.com/api/wishlist';

    var authedFetch = async function (init) {
      var sf = window._sf;
      var current = sf && sf.auth.currentUser;
      if (!current) throw new Error('signed_out');
      var token = await current.getIdToken();
      init = init || {};
      init.headers = Object.assign({ Authorization: 'Bearer ' + token }, init.headers || {});
      var res = await fetch(API, init);
      if (!res.ok) throw new Error('wishlist_http_' + res.status);
      return res.json();
    };

    var strings = window.dsWishlistStrings || { add: 'Add to wishlist', added: 'On wishlist', error: 'Could not update your wishlist.' };

    var renderPage = function (ctl) {
      var catalogEl = document.getElementById('wishlist-catalog');
      var list = document.getElementById('wishlist-list');
      if (!catalogEl || !list) return;
      var catalog = JSON.parse(catalogEl.textContent);
      var signedOut = document.getElementById('wishlist-signed-out');
      var empty = document.getElementById('wishlist-empty');
      var entries = ctl.signedIn() ? wishlistEntries(ctl.items(), catalog) : [];
      signedOut.hidden = ctl.signedIn();
      empty.hidden = !ctl.signedIn() || entries.length > 0;
      list.textContent = '';
      var pageStrings = window.dsWishlistPageStrings || {};
      entries.forEach(function (entry) {
        var row = document.createElement('div');
        row.className = 'wishlist-row wishlist-row-' + entry.kind;
        var link = document.createElement('a');
        link.href = entry.url;
        link.className = 'wishlist-row-link';
        var img = document.createElement('img');
        img.src = entry.image;
        img.alt = '';
        img.loading = 'lazy';
        img.className = 'wishlist-row-img';
        var text = document.createElement('div');
        text.className = 'wishlist-row-text';
        var kind = document.createElement('span');
        kind.className = 'catalog-badge';
        kind.textContent = pageStrings[entry.kind] || entry.kind;
        var title = document.createElement('span');
        title.className = 'wishlist-row-title';
        title.textContent = entry.title;
        text.appendChild(kind);
        text.appendChild(title);
        link.appendChild(img);
        link.appendChild(text);
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'wishlist-remove';
        remove.textContent = pageStrings.remove || 'Remove';
        remove.addEventListener('click', function () { ctl.toggle(entry.item_id, false); });
        row.appendChild(link);
        row.appendChild(remove);
        list.appendChild(row);
      });
    };

    var ctl = createController({
      api: {
        list: async function () { return (await authedFetch()).items || []; },
        set: function (id, on) {
          return authedFetch({
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_id: id, wishlisted: on }),
          });
        },
      },
      storage: window.localStorage,
      strings: strings,
      getButtons: function (id) {
        var all = document.querySelectorAll('[data-wishlist-item]');
        return Array.prototype.filter.call(all, function (b) { return !id || b.dataset.wishlistItem === id; });
      },
      openAuth: function () { if (window.openAuthModal) window.openAuthModal(); },
      onError: function () { if (window.alert) window.alert(strings.error); },
      onChange: function () { renderPage(ctl); },
    });

    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-wishlist-item]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      ctl.click(btn);
      if (window.dsTrack) window.dsTrack('wishlist_click', { item_id: btn.dataset.wishlistItem });
    });

    window.addEventListener('ds-auth', function (e) { ctl.onAuth(e.detail && e.detail.user); });
    if (window.dsAuthUser !== undefined) ctl.onAuth(window.dsAuthUser);
  }

  return { isValidItemId: isValidItemId, wishlistEntries: wishlistEntries, createController: createController };
});
