// Dynamic memes: the site hosts only the base image; captions arrive in the
// URL fragment with an ECDSA P-256 signature made by the SMM pipeline
// (smm/posting pipeline/src/meme_links.py):
//
//   /memes/<id>/#<payload>.<signature>
//   payload   = base64url(JSON {"v":1,"m":<id>,"t":{<slot>:<text>},"a"?:<path>})
//   signature = base64url(raw r||s ECDSA-P256-SHA256 over the ASCII payload)
//
// Text is drawn only after the signature verifies against the public key
// embedded in the page, the payload names this page's meme, and every slot
// passes the memes.json limits and fits its box (max_lines, min font size).
// Anything else shows the plain template. Caption text only ever reaches
// the canvas, textContent and attributes -- never innerHTML.
//
// UMD so node --test can exercise the pure parts (see meme-render.test.js).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.DsMeme = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var MAX_FRAGMENT_CHARS = 1500;
  var PAYLOAD_VERSION = 1;
  var LINE_HEIGHT = 1.12;
  var MIN_FONT_FRACTION = 0.028; // of image height
  var ARTICLE_PATH_RE = /^\/(?:s\/[A-Za-z0-9]{4,12}|(?:[a-z]{2}(?:-[A-Za-z]+)?\/)?(?:article|quiz)\/[a-z0-9-]{1,120})\/$/;
  var CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;
  var FONT_FAMILY = 'Impact, Anton, "Arial Black", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif';

  function b64urlToBytes(s) {
    if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad base64url');
    var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // "#<payload>.<sig>" -> {payloadB64, sigB64} or null.
  function parseFragment(hash) {
    if (!hash) return null;
    var h = hash.charAt(0) === '#' ? hash.slice(1) : hash;
    if (!h || h.length > MAX_FRAGMENT_CHARS) return null;
    var parts = h.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
    return { payloadB64: parts[0], sigB64: parts[1] };
  }

  function decodePayload(payloadB64) {
    var json = new TextDecoder('utf-8', { fatal: true }).decode(b64urlToBytes(payloadB64));
    var obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('payload not an object');
    return obj;
  }

  function verifySignature(subtle, publicKeyB64, payloadB64, sigB64) {
    if (!subtle) return Promise.resolve(false);
    var sig;
    try {
      sig = b64urlToBytes(sigB64);
    } catch (e) {
      return Promise.resolve(false);
    }
    if (sig.length !== 64) return Promise.resolve(false);
    return subtle
      .importKey('raw', b64urlToBytes(publicKeyB64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
      .then(function (key) {
        return subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, new TextEncoder().encode(payloadB64));
      })
      .catch(function () {
        return false;
      });
  }

  // Must match meme_links.clean_text() in the pipeline.
  function normalizeText(s) {
    return String(s == null ? '' : s)
      .normalize('NFC')
      .replace(CONTROL_RE, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function charCount(s) {
    return Array.from(s).length;
  }

  // -> {ok:true, texts, article} or {ok:false, error}
  function validatePayload(payload, meme) {
    if (!payload || payload.v !== PAYLOAD_VERSION) return { ok: false, error: 'unsupported link version' };
    if (payload.m !== meme.id) return { ok: false, error: 'link is for a different meme' };
    var t = payload.t;
    if (!t || typeof t !== 'object' || Array.isArray(t)) return { ok: false, error: 'no captions' };
    var slots = {};
    meme.slots.forEach(function (s) {
      slots[s.name] = s;
    });
    var texts = {};
    var n = 0;
    var names = Object.keys(t);
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var slot = slots[name];
      if (!slot || typeof t[name] !== 'string') return { ok: false, error: 'unknown caption slot' };
      var text = normalizeText(t[name]);
      if (!text) continue;
      if (charCount(text) > slot.max_chars) return { ok: false, error: 'caption too long' };
      texts[name] = text;
      n++;
    }
    if (!n) return { ok: false, error: 'no captions' };
    var article = null;
    if (payload.a != null) {
      if (typeof payload.a !== 'string' || !ARTICLE_PATH_RE.test(payload.a)) return { ok: false, error: 'bad article link' };
      article = payload.a;
    }
    return { ok: true, texts: texts, article: article };
  }

  function isCjk(ch) {
    return /[\u3000-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/.test(ch);
  }

  // Greedy word wrap with measure(str)->px. Words wider than maxWidth, and
  // CJK runs (no spaces), break between characters.
  function wrapLines(text, maxWidth, measure) {
    var tokens = [];
    var words = text.split(' ');
    words.forEach(function (w, wi) {
      var chars = Array.from(w);
      var buf = '';
      chars.forEach(function (ch) {
        if (isCjk(ch)) {
          if (buf) tokens.push({ s: buf, space: false });
          tokens.push({ s: ch, space: false });
          buf = '';
        } else {
          buf += ch;
        }
      });
      if (buf) tokens.push({ s: buf, space: false });
      if (wi < words.length - 1 && tokens.length) tokens[tokens.length - 1].space = true;
    });

    var lines = [];
    var line = '';
    var pendingSpace = false;
    function pushPiece(piece) {
      var candidate = line ? line + (pendingSpace ? ' ' : '') + piece : piece;
      if (!line || measure(candidate) <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = piece;
      }
    }
    tokens.forEach(function (tok) {
      if (measure(tok.s) <= maxWidth) {
        pushPiece(tok.s);
      } else {
        // Overlong word: break by character.
        Array.from(tok.s).forEach(function (ch, i) {
          if (i === 0) {
            pushPiece(ch);
          } else if (measure(line + ch) <= maxWidth) {
            line += ch;
          } else {
            lines.push(line);
            line = ch;
          }
        });
      }
      pendingSpace = tok.space;
    });
    if (line) lines.push(line);
    return lines;
  }

  function displayText(text, slot) {
    return slot.style === 'caption' ? text.toUpperCase() : text;
  }

  // Largest font size at which the text fits slot.max_lines inside the box.
  // measureAt(fontPx) returns a measure(str)->px function for that size.
  // -> {fontPx, lines, box} or null when it cannot fit at the minimum size.
  function fitSlot(text, slot, imgW, imgH, measureAt, capPx) {
    var box = { x: slot.x * imgW, y: slot.y * imgH, w: slot.w * imgW, h: slot.h * imgH };
    var shown = displayText(text, slot);
    var minPx = Math.max(10, Math.floor(imgH * MIN_FONT_FRACTION));
    var maxPx = Math.floor(box.h / LINE_HEIGHT);
    if (capPx) maxPx = Math.min(maxPx, capPx);
    for (var px = maxPx; px >= minPx; px--) {
      var measure = measureAt(px);
      var inner = box.w - px * 0.3; // room for the outline stroke
      var lines = wrapLines(shown, inner, measure);
      if (lines.length > slot.max_lines) continue;
      if (lines.length * px * LINE_HEIGHT > box.h) continue;
      var tooWide = lines.some(function (l) {
        return measure(l) > inner;
      });
      if (tooWide) continue;
      return { fontPx: px, lines: lines, box: box };
    }
    return null;
  }

  function slotValign(slot) {
    if (slot.valign) return slot.valign;
    if (slot.style === 'label') return 'middle';
    return slot.y < 0.5 ? 'top' : 'bottom';
  }

  function fontFor(px) {
    return '900 ' + px + 'px ' + FONT_FAMILY;
  }

  // Lays out every slot; null if any slot does not fit. Slots of the same
  // style share one font size (the smallest any of them needs) so labels
  // and top/bottom captions look like one set.
  function layoutMeme(ctx, meme, texts, imgW, imgH, measureAt) {
    measureAt =
      measureAt ||
      function (px) {
        ctx.font = fontFor(px);
        return function (s) {
          return ctx.measureText(s).width;
        };
      };
    var used = meme.slots.filter(function (s) {
      return texts[s.name];
    });
    var cap = {};
    for (var i = 0; i < used.length; i++) {
      var first = fitSlot(texts[used[i].name], used[i], imgW, imgH, measureAt);
      if (!first) return null;
      var style = used[i].style;
      cap[style] = cap[style] ? Math.min(cap[style], first.fontPx) : first.fontPx;
    }
    return used.map(function (slot) {
      var fit = fitSlot(texts[slot.name], slot, imgW, imgH, measureAt, cap[slot.style]);
      fit.slot = slot;
      return fit;
    });
  }

  function drawLayout(ctx, layout) {
    layout.forEach(function (f) {
      var lh = f.fontPx * LINE_HEIGHT;
      var total = f.lines.length * lh;
      var valign = slotValign(f.slot);
      var top = valign === 'top' ? f.box.y : valign === 'bottom' ? f.box.y + f.box.h - total : f.box.y + (f.box.h - total) / 2;
      ctx.font = fontFor(f.fontPx);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, f.fontPx * 0.14);
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#fff';
      f.lines.forEach(function (line, i) {
        var y = top + lh * i + lh / 2;
        var x = f.box.x + f.box.w / 2;
        ctx.strokeText(line, x, y);
        ctx.fillText(line, x, y);
      });
    });
  }

  // Browser entry point. cfg = {meme, publicKey, imageUrl}; els = {canvas,
  // status, caption, articleLink}.
  function init(cfg, els, win) {
    win = win || window;
    var img = new Image();
    var ctx = els.canvas.getContext('2d');

    function setStatus(msg) {
      els.status.textContent = msg || '';
      els.status.hidden = !msg;
    }

    function drawBase() {
      els.canvas.width = img.naturalWidth;
      els.canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
    }

    function render() {
      drawBase();
      els.caption.textContent = '';
      els.articleLink.hidden = true;
      els.canvas.setAttribute('aria-label', cfg.meme.title + ' meme');
      var frag = parseFragment(win.location.hash);
      if (!frag) {
        setStatus(win.location.hash && win.location.hash.length > 1 ? 'This meme link is malformed, showing the plain template.' : '');
        return Promise.resolve(false);
      }
      return verifySignature(win.crypto && win.crypto.subtle, cfg.publicKey, frag.payloadB64, frag.sigB64).then(function (ok) {
        if (!ok) {
          setStatus('This meme link is not signed by DeepSage, showing the plain template.');
          return false;
        }
        var v;
        try {
          v = validatePayload(decodePayload(frag.payloadB64), cfg.meme);
        } catch (e) {
          v = { ok: false, error: 'unreadable captions' };
        }
        if (!v.ok) {
          setStatus('This meme link is invalid (' + v.error + '), showing the plain template.');
          return false;
        }
        var layout = layoutMeme(ctx, cfg.meme, v.texts, img.naturalWidth, img.naturalHeight);
        if (!layout) {
          setStatus('These captions do not fit this meme, showing the plain template.');
          return false;
        }
        drawBase();
        drawLayout(ctx, layout);
        setStatus('');
        var alt = cfg.meme.slots
          .filter(function (s) {
            return v.texts[s.name];
          })
          .map(function (s) {
            return v.texts[s.name];
          })
          .join(' / ');
        els.caption.textContent = alt;
        els.canvas.setAttribute('aria-label', cfg.meme.title + ' meme: ' + alt);
        if (v.article) {
          els.articleLink.setAttribute('href', v.article);
          els.articleLink.hidden = false;
        }
        return true;
      });
    }

    var ready = new Promise(function (resolve) {
      img.onload = function () {
        resolve(render());
      };
      img.onerror = function () {
        setStatus('Could not load the meme image.');
        resolve(false);
      };
    });
    img.src = cfg.imageUrl;
    win.addEventListener('hashchange', render);
    return ready;
  }

  return {
    MAX_FRAGMENT_CHARS: MAX_FRAGMENT_CHARS,
    parseFragment: parseFragment,
    decodePayload: decodePayload,
    verifySignature: verifySignature,
    normalizeText: normalizeText,
    validatePayload: validatePayload,
    wrapLines: wrapLines,
    fitSlot: fitSlot,
    layoutMeme: layoutMeme,
    init: init,
  };
});
