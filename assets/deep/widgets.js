/* DeepSage deep-article widgets (docs/sdd/2026-10-17-deep-interactive.md).
 * Own code, no dependencies, no network. Progressive enhancement: the page is
 * complete without this script; it adds count-ups, the predict slider,
 * quiz feedback, chart tooltips, diagram notes, glossary and source peeks.
 * Data from the page is only ever written with textContent. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.DeepWidgets = api;
    if (root.document) {
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', function () { api.init(root.document, root); });
      else api.init(root.document, root);
    }
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // --- pure helpers (unit-tested in widgets.test.js) ---------------------------------

  // page-language number format and UI strings (set by init from the page's data block)
  var NUM = { group: ',', decimal: '.' };
  var TEXT = {
    answer_is: 'The answer is',
    'spot-on': 'Spot on. Either you knew this already or you are suspiciously good at guessing.',
    close: 'Close. Your intuition is in the right neighbourhood.',
    far: 'Far off, and that is the point: this is the number intuition gets wrong.',
    checks: 'Quick checks: {c} of {t} right', open: ' ({n} still open)', flawless: '. Flawless.'
  };

  function fill(template, values) {
    return String(template).replace(/\{(\w+)\}/g, function (m, k) { return k in values ? values[k] : m; });
  }

  function formatNumber(value, fmt) {
    fmt = fmt || NUM;
    var v = Number(value);
    if (!isFinite(v)) return String(value);
    var given = (String(value).split('.')[1] || '').length;
    var decimals = typeof value === 'string' ? given : (Math.abs(v) >= 100 ? 0 : given);   // text = as written
    var fixed = v.toFixed(Math.min(decimals, 2));
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, fmt.group);
    return parts.join(fmt.decimal);
  }

  /* n eased steps from 0 that always end exactly on the value. */
  function countUpSteps(value, n) {
    var v = Number(value), out = [];
    n = Math.max(1, n | 0);
    var decimals = (String(value).split('.')[1] || '').length;
    for (var i = 1; i <= n; i++) {
      var t = i / n, eased = 1 - Math.pow(1 - t, 3);
      out.push(i === n ? v : Number((v * eased).toFixed(decimals)));
    }
    return out;
  }

  function useLog(min, max) { return min > 0 && max / min >= 100; }

  function sliderToValue(pos, min, max) {
    var t = Math.min(1, Math.max(0, pos / 1000));
    if (useLog(min, max)) return Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min)));
    return min + t * (max - min);
  }

  function valueToSlider(value, min, max) {
    if (useLog(min, max)) return Math.round(1000 * (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min)));
    return Math.round(1000 * (value - min) / (max - min));
  }

  /* How far a guess is from the answer: relative error on the slider's own scale. */
  function predictFeedback(guess, answer, min, max) {
    var off = useLog(min, max)
      ? Math.abs(Math.log(guess) - Math.log(answer)) / (Math.log(max) - Math.log(min))
      : Math.abs(guess - answer) / (max - min);
    var verdict = off <= 0.03 ? 'spot-on' : off <= 0.15 ? 'close' : 'far';
    var direction = guess < answer ? 'low' : guess > answer ? 'high' : 'exact';
    return { off: off, verdict: verdict, direction: direction };
  }

  function quizScore(results) {
    var answered = 0, correct = 0;
    Object.keys(results || {}).forEach(function (k) {
      answered++;
      if (results[k]) correct++;
    });
    return { answered: answered, correct: correct };
  }

  /* A "nice" upper bound for a chart axis. */
  function niceMax(values) {
    var max = Math.max.apply(null, values.map(Number).filter(isFinite).concat([0]));
    if (max <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log(max) / Math.LN10));
    var steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * mag >= max) return steps[i] * mag;
    return 10 * mag;
  }

  // --- DOM wiring ---------------------------------------------------------------------

  // index of the section being read: the last heading above a line 30% down the window
  function activeSection(tops, y, viewport) {
    var line = y + 0.3 * viewport, k = -1;
    for (var i = 0; i < tops.length; i++) if (tops[i] <= line) k = i;
    return k;
  }

  function all(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  function reducedMotion(win) {
    return !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function storage(win) {
    try { var s = win.localStorage; s.setItem('__deep', '1'); s.removeItem('__deep'); return s; } catch (e) { return null; }
  }

  function popover(doc) {
    var tip = doc.createElement('div');
    tip.className = 'deep-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    doc.body.appendChild(tip);
    return {
      show: function (anchor, title, text) {
        tip.textContent = '';
        if (title) { var b = doc.createElement('strong'); b.textContent = title; tip.appendChild(b); }
        var p = doc.createElement('span'); p.textContent = text || ''; tip.appendChild(p);
        tip.hidden = false;
        var r = anchor.getBoundingClientRect();
        var top = r.bottom + 8 + (doc.defaultView.pageYOffset || 0);
        var left = Math.max(8, Math.min(r.left + (doc.defaultView.pageXOffset || 0), doc.documentElement.clientWidth - tip.offsetWidth - 8));
        tip.style.top = top + 'px';
        tip.style.left = left + 'px';
      },
      hide: function () { tip.hidden = true; }
    };
  }

  // --- GA4 engagement events (docs/sdd/2026-10-19-ga4-rewards-and-policy-league.md REQ-GE1) ---------------
  // deep_interaction goes through the site's consent-gated dsTrack, once per widget element and action per page
  // view; with no dsTrack (the local preview) nothing is sent. Params are names and the page path only.
  function makeTracker(win) {
    var seen = typeof WeakMap === 'function' ? new WeakMap() : null, keys = {};
    return function track(widget, action, el, extra) {
      if (!win || typeof win.dsTrack !== 'function') return false;
      var tag = widget + ':' + action;
      if (el && seen) {
        var s = seen.get(el) || {};
        if (s[tag]) return false;
        s[tag] = 1;
        seen.set(el, s);
      } else {
        if (keys[tag]) return false;
        keys[tag] = 1;
      }
      var p = { widget: widget, action: action, item_id: win.location ? win.location.pathname : '' };
      Object.keys(extra || {}).forEach(function (k) { p[k] = extra[k]; });
      win.dsTrack('deep_interaction', p);
      return true;
    };
  }
  function noop() {}

  /* All key numbers are visible at once; they count up together when the cards scroll into view. */
  function initKeyNumbers(doc, win) {
    all(doc, '.keynums').forEach(function (box) {
      var nums = all(box, '[data-count]');
      function go() { nums.forEach(function (el) { countUp(el, win); }); }
      if (!win.IntersectionObserver) { go(); return; }
      var seen = new win.IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { seen.disconnect(); go(); }
      }, { threshold: 0.3 });
      seen.observe(box);
    });
  }

  function countUp(el, win) {
    if (!el || el.dataset.counted) return;
    el.dataset.counted = '1';
    var target = el.dataset.count;
    if (!isFinite(Number(target))) return;                       // a range like "1.5 and 5.5" stays as written
    var steps = countUpSteps(target, 30);
    if (reducedMotion(win) || !win.requestAnimationFrame) { el.textContent = formatNumber(target); return; }
    var i = 0;
    (function frame() {
      if (i >= steps.length) return;
      el.textContent = i === steps.length - 1 ? formatNumber(target) : formatNumber(steps[i]);
      if (++i < steps.length) win.requestAnimationFrame(frame);
    })();
    // throttled frames (background tab, hidden pane) must never leave a partial number on screen
    if (win.setTimeout) win.setTimeout(function () { i = steps.length; el.textContent = formatNumber(target); }, 1200);
  }

  function initPredict(doc, track) {
    track = track || noop;
    all(doc, '.predict').forEach(function (box) {
      var min = Number(box.dataset.min), max = Number(box.dataset.max), answer = Number(box.dataset.answer);
      var range = box.querySelector('input[type=range]'), out = box.querySelector('output');
      var reveal = box.querySelector('.reveal'), fb = box.querySelector('.feedback'), unit = box.dataset.unit || '';
      function guess() { return sliderToValue(Number(range.value), min, max); }
      function show() { out.textContent = formatNumber(Math.round(guess() * 100) / 100) + (unit ? ' ' + unit : ''); }
      range.addEventListener('input', show);
      show();
      reveal.addEventListener('click', function () {
        var f = predictFeedback(guess(), answer, min, max);
        box.classList.add('revealed', f.verdict);
        fb.textContent = TEXT.answer_is + ' ' + formatNumber(answer) + (unit ? ' ' + unit : '') + '. ' + TEXT[f.verdict] +
          ' ' + (box.dataset.explain || '');
        var mark = box.querySelector('.answer-mark');
        if (mark) { mark.style.left = (valueToSlider(answer, min, max) / 10) + '%'; mark.hidden = false; }
        reveal.disabled = true;
        range.disabled = true;
        track('predict', 'reveal', box, { verdict: f.verdict });
      });
    });
  }

  function initQuiz(doc, win, track) {
    track = track || noop;
    var store = storage(win), key = 'deep-quiz:' + (win.location ? win.location.pathname : '');
    var results = {};
    try { results = JSON.parse((store && store.getItem(key)) || '{}'); } catch (e) { results = {}; }
    var scoreEl = doc.querySelector('.quiz-score');
    function updateScore() {
      var s = quizScore(results), total = all(doc, '.quiz').length;
      if (scoreEl && s.answered) scoreEl.textContent = fill(TEXT.checks, { c: s.correct, t: total }) +
        (s.answered < total ? fill(TEXT.open, { n: total - s.answered }) : s.correct === total ? TEXT.flawless : '.');
    }
    all(doc, '.quiz').forEach(function (box, qi) {
      var answer = Number(box.dataset.answer), id = box.id || ('q' + qi);
      var opts = all(box, '.opt');
      function choose(i, silent) {
        opts.forEach(function (o, k) {
          o.disabled = true;
          o.classList.toggle('right', k === answer);
          o.classList.toggle('wrong', k === i && i !== answer);
          var why = o.parentNode.querySelector('.why');
          if (why && (k === i || k === answer)) why.hidden = false;
        });
        box.classList.add('done');
        if (!silent) {
          track('quiz', 'answer', box, { correct: i === answer });
          results[id] = i === answer;
          if (store) store.setItem(key, JSON.stringify(results));
        }
        updateScore();
      }
      opts.forEach(function (o, i) { o.addEventListener('click', function () { choose(i, false); }); });
      if (id in results) choose(results[id] ? answer : -1, true);
    });
    updateScore();
  }

  function initCharts(doc, tip, track) {
    track = track || noop;
    all(doc, 'svg.chart [data-y]').forEach(function (el) {
      el.setAttribute('tabindex', '0');
      function show() { track('chart', 'tooltip', el.closest ? el.closest('svg') : null); tip.show(el, el.dataset.series || '', el.dataset.x + ': ' + formatNumber(el.dataset.y) + ' ' + (el.dataset.unit || '')); }
      el.addEventListener('mouseenter', show);
      el.addEventListener('focus', show);
      el.addEventListener('mouseleave', tip.hide);
      el.addEventListener('blur', tip.hide);
    });
    all(doc, '.chart-legend button').forEach(function (b) {
      b.addEventListener('click', function () {
        var on = b.getAttribute('aria-pressed') !== 'false';
        track('chart', 'toggle', b);
        b.setAttribute('aria-pressed', on ? 'false' : 'true');
        var svg = b.closest('figure').querySelector('svg.chart');
        all(svg, '[data-series-index="' + b.dataset.index + '"]').forEach(function (el) { el.style.display = on ? 'none' : ''; });
      });
    });
  }

  function initNotes(doc, track) {
    track = track || noop;
    all(doc, 'figure').forEach(function (fig) {
      var note = fig.querySelector('.hotnote');
      if (!note) return;
      all(fig, '.hotspot, .fnode').forEach(function (el) {
        function show() {
          all(fig, '.hotspot, .fnode').forEach(function (x) { x.classList.remove('active'); });
          el.classList.add('active');
          note.textContent = el.dataset.note || '';
          track('diagram', 'note', fig);
        }
        el.addEventListener('click', show);
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
      });
    });
  }

  function initPeeks(doc, data, tip, track) {
    track = track || noop;
    var sources = (data && data.sources) || {};
    all(doc, 'a.cite').forEach(function (a) {
      var s = sources[a.dataset.src];
      if (!s) return;
      function show() { track('source', 'peek', a); tip.show(a, s.title + ' (' + s.domain + ')', s.quote ? '“' + s.quote + '”' : ''); }
      a.addEventListener('mouseenter', show);
      a.addEventListener('focus', show);
      a.addEventListener('mouseleave', tip.hide);
      a.addEventListener('blur', tip.hide);
    });
    all(doc, 'dfn.term').forEach(function (d) {
      function show() { track('glossary', 'term', d); tip.show(d, d.textContent, d.dataset.plain || ''); }
      d.addEventListener('click', show);
      d.addEventListener('focus', show);
      d.addEventListener('mouseenter', show);
      d.addEventListener('mouseleave', tip.hide);
      d.addEventListener('blur', tip.hide);
    });
  }

  function initTryIt(doc, win, track) {
    track = track || noop;
    var store = storage(win), key = 'deep-tryit:' + (win.location ? win.location.pathname : '');
    var done = {};
    try { done = JSON.parse((store && store.getItem(key)) || '{}'); } catch (e) { done = {}; }
    all(doc, '.tryit input[type=checkbox]').forEach(function (c) {
      c.checked = !!done[c.dataset.key];
      c.addEventListener('change', function () {
        done[c.dataset.key] = c.checked;
        if (c.checked) track('tryit', 'check', c);
        if (store) store.setItem(key, JSON.stringify(done));
      });
    });
  }

  function initTimeline(doc, track) {
    track = track || noop;
    all(doc, '.timeline').forEach(function (tl) {
      var dots = all(tl, '.tl-dot');
      dots.forEach(function (d) {
        d.addEventListener('click', function (e) {
          var open = d.getAttribute('aria-expanded') !== 'true';
          if (e && e.isTrusted) track('timeline', 'step', d);            // the scripted first open is not a reader
          dots.forEach(function (x) { x.setAttribute('aria-expanded', 'false'); x.parentNode.classList.remove('open'); });
          d.setAttribute('aria-expanded', open ? 'true' : 'false');
          d.parentNode.classList.toggle('open', open);
        });
      });
      if (dots[0]) dots[0].click();
    });
  }

  function initToc(doc, win) {
    var links = all(doc, '.toc-link');
    if (!links.length) return;
    var heads = links.map(function (a) { return doc.getElementById(a.getAttribute('href').slice(1)); });
    function update() {
      var tops = heads.map(function (h) { return h ? h.getBoundingClientRect().top + (win.pageYOffset || 0) : Infinity; });
      var k = activeSection(tops, win.pageYOffset || 0, win.innerHeight || 800);
      links.forEach(function (a, i) {
        a.classList.toggle('here', i === k);
        a.classList.toggle('read', i < k);
      });
    }
    all(doc, '.quiz').forEach(function (q) {
      q.addEventListener('click', function () {
        var h = q.previousElementSibling;
        while (h && h.tagName !== 'H2') h = h.previousElementSibling;
        links.forEach(function (a) { if (h && a.getAttribute('href') === '#' + h.id) a.classList.add('checked'); });
      });
    });
    win.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* Generated pictures open large in an overlay; Esc or a click closes it. Without JS the link opens the file. */
  function initZoom(doc, track) {
    track = track || noop;
    var links = all(doc, 'a.zoom');
    if (!links.length) return;
    var box = doc.createElement('div'), img = doc.createElement('img');
    box.className = 'zoombox';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.appendChild(img);
    doc.body.appendChild(box);
    function close() { box.hidden = true; img.removeAttribute('src'); }
    links.forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        track('picture', 'zoom', a);
        img.setAttribute('src', a.getAttribute('href'));
        var inner = a.querySelector('img');
        img.setAttribute('alt', inner ? inner.getAttribute('alt') || '' : '');
        box.hidden = false;
      });
    });
    box.addEventListener('click', close);
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  // --- memes in an overlay (docs/sdd/2026-10-18-deep-black-boxes.md REQ-BB7) ----------------------
  // Largest font size (px) at which `chars` characters fit `lines` lines of a box; a meme caption font
  // is about 0.7 em wide per upper-case character (Impact is narrower, the Arial Black fallback wider) and 1.15 em
  // per line; sizeCaptions then shrinks until the text really fits.
  function captionSize(chars, boxW, boxH, lines) {
    lines = Math.max(1, lines || 2);
    var byHeight = boxH / (lines * 1.15);
    var byWidth = chars > 0 ? (boxW * lines * 0.85) / (chars * 0.7) : byHeight;
    return Math.max(10, Math.floor(Math.min(byHeight, byWidth)));
  }

  function sizeCaptions(root) {
    all(root, '.cap').forEach(function (cap) {
      var box = cap.getBoundingClientRect ? cap.getBoundingClientRect() : { width: 0, height: 0 };
      if (!box.width) return;
      var px = captionSize(cap.textContent.length, box.width, box.height, Number(cap.getAttribute('data-lines')) || 2);
      cap.style.fontSize = px + 'px';
      while (px > 10 && (cap.scrollHeight > cap.clientHeight + 1 || cap.scrollWidth > cap.clientWidth + 1)) {
        px -= 2;
        cap.style.fontSize = px + 'px';
      }
    });
  }

  // The card's summary opens the dialog instead of the inline fallback; closing returns focus to the card.
  function bindMeme(details, dialog) {
    var summary = details.querySelector('summary');
    var closeBtn = dialog.querySelector('.close');
    function close() { if (dialog.open) dialog.close(); }
    summary.addEventListener('click', function (e) {
      e.preventDefault();
      if (details.__track) details.__track('meme', 'open', details);
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
      sizeCaptions(dialog);
    });
    if (closeBtn) closeBtn.addEventListener('click', close);
    dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });   // backdrop
    dialog.addEventListener('close', function () { summary.focus(); });
    return { close: close };
  }

  function initMemes(doc, win, track) {
    track = track || noop;
    all(doc, 'details').forEach(function (d) {                    // black boxes, deep dives, memes
      d.addEventListener('toggle', function () {
        if (d.open) track(d.classList.contains('meme') ? 'meme' : d.classList.contains('blackbox') ? 'blackbox' : 'details', 'open', d);
      });
    });
    all(doc, 'details.blackbox.meme').forEach(function (d) {
      var dialog = doc.getElementById(d.getAttribute('data-meme'));
      d.__track = track;
      if (dialog) bindMeme(d, dialog);
      d.addEventListener('toggle', function () { if (d.open) sizeCaptions(d); });
    });
    win.addEventListener('resize', function () { all(doc, 'dialog.meme-overlay[open]').forEach(sizeCaptions); });
  }

  function initProgress(doc, win) {
    var bar = doc.querySelector('.progress span');
    if (!bar) return;
    function update() {
      var h = doc.documentElement.scrollHeight - win.innerHeight;
      bar.style.width = (h > 0 ? Math.min(100, 100 * (win.pageYOffset || 0) / h) : 0) + '%';
    }
    win.addEventListener('scroll', update, { passive: true });
    update();
  }

  function init(doc, win) {
    doc.documentElement.classList.add('js');
    var data = {};
    var raw = doc.getElementById('deep-data');
    try { data = JSON.parse(raw ? raw.textContent : '{}'); } catch (e) { data = {}; }
    var ui = data.ui || {};
    Object.keys(TEXT).forEach(function (k) { if (ui[k]) TEXT[k] = ui[k]; });
    if (ui.group) NUM = { group: ui.group, decimal: ui.decimal || '.' };
    var tip = popover(doc), track = makeTracker(win);
    initKeyNumbers(doc, win);
    initPredict(doc, track);
    initQuiz(doc, win, track);
    initCharts(doc, tip, track);
    initNotes(doc, track);
    initPeeks(doc, data, tip, track);
    initTryIt(doc, win, track);
    initProgress(doc, win);
    initTimeline(doc, track);
    initToc(doc, win);
    initZoom(doc, track);
    initMemes(doc, win, track);
    if (root_datavis(win)) root_datavis(win).init(doc, win, NUM);
  }

  function root_datavis(win) { return win && win.DeepDatavis; }

  return {
    formatNumber: formatNumber, countUpSteps: countUpSteps, sliderToValue: sliderToValue,
    valueToSlider: valueToSlider, predictFeedback: predictFeedback, quizScore: quizScore, niceMax: niceMax,
    activeSection: activeSection, captionSize: captionSize, bindMeme: bindMeme, makeTracker: makeTracker, init: init
  };
});
