// Copy-link and native-share buttons of the share block
// (docs/sdd/2026-11-01-share-and-subscribe-cta.md, REQ-CT4). Everything else in
// the block is plain links, so the page shares without this script.
(function (root) {
  function copyText(text, doc, nav) {
    if (nav && nav.clipboard && nav.clipboard.writeText) {
      return nav.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(false);
  }

  function onCopy(button, doc, nav) {
    var url = button.closest('.share-cta').getAttribute('data-share-url');
    var label = (button.querySelector && button.querySelector('.share-cta-name')) || button;
    return copyText(url, doc, nav).then(function (ok) {
      if (!ok) {
        var tmp = doc.createElement('textarea');
        tmp.value = url;
        tmp.style.position = 'fixed';
        tmp.style.opacity = '0';
        doc.body.appendChild(tmp);
        tmp.select();
        try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
        tmp.remove();
      }
      if (ok) {
        var original = button.getAttribute('data-original-label') || label.textContent;
        button.setAttribute('data-original-label', original);
        label.textContent = button.getAttribute('data-copied-label');
        button.classList.add('is-copied');
        setTimeout(function () { label.textContent = original; button.classList.remove('is-copied'); }, 2000);
        if (root.dsTrack) root.dsTrack('share', { method: 'copy_link', item_id: root.location.pathname });
      }
      return ok;
    });
  }

  function init(doc, nav) {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-share-copy]'), function (button) {
      button.addEventListener('click', function () { onCopy(button, doc, nav); });
    });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-share-native]'), function (button) {
      if (!nav || !nav.share) return;
      button.hidden = false;
      button.addEventListener('click', function () {
        var block = button.closest('.share-cta');
        nav.share({ title: block.getAttribute('data-share-text'), url: block.getAttribute('data-share-url') }).catch(function () {});
      });
    });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-share]'), function (link) {
      link.addEventListener('click', function () {
        if (root.dsTrack) root.dsTrack('share', { method: link.getAttribute('data-share'), item_id: root.location.pathname });
      });
    });
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { onCopy: onCopy, init: init };
  else if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', function () { init(root.document, root.navigator); });
    else init(root.document, root.navigator);
  }
})(typeof window !== 'undefined' ? window : globalThis);
