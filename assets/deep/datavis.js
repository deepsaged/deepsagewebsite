/* DeepSage data charts (docs/sdd/2026-10-18-deep-data-viz.md REQ-DD6).
 * Own code on top of a local copy of D3 v7 (ISC licence, pipeline/assets/vendor/). No network.
 * Progressive enhancement: every chart already ships its numbers as a <details> table; this script draws
 * the interactive chart above it (hover tooltip, series toggle, focus line, keyboard focus on points).
 * Data from the page is only ever written with textContent / D3 .text(). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DeepDatavis = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PALETTE = ['#00aaff', '#d9b978', '#00ffcc', '#ff8a5c', '#b48cff', '#7fd36b'];

  // --- pure helpers (unit-tested in datavis.test.js) ---------------------------------
  function prepare(spec) {
    var rows = (spec && spec.rows) || [];
    var names = [];
    rows.forEach(function (r) { if (names.indexOf(r.series) < 0) names.push(r.series); });
    var categorical = rows.some(function (r) { return typeof r.x !== 'number'; });
    var series = names.map(function (name, i) {
      var pts = rows.filter(function (r) { return r.series === name; });
      if (!categorical) pts = pts.slice().sort(function (a, b) { return a.x - b.x; });
      return { name: name, color: PALETTE[i % PALETTE.length], points: pts };
    });
    var ys = rows.map(function (r) { return r.y; });
    return { series: series, categorical: categorical, yMin: Math.min.apply(null, ys.concat([0])),
             yMax: Math.max.apply(null, ys.concat([0])), count: rows.length };
  }

  function fmt(v, num) {
    num = num || { group: ',', decimal: '.' };
    var abs = Math.abs(v), d = abs >= 100 ? 0 : abs >= 1 ? 2 : 4;
    var s = Number(v).toFixed(d);
    if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, num.group);
    return parts.join(num.decimal);
  }

  function tooltipText(point, unit, num) {
    var x = String(point.x);
    return (point.series ? point.series + ' · ' : '') + x + ': ' + fmt(point.y, num) + (unit ? ' ' + unit : '');
  }

  function toggle(hidden, name) {
    var out = Object.assign({}, hidden);
    out[name] = !out[name];
    return out;
  }

  function visible(prepared, hidden) {
    return prepared.series.filter(function (s) { return !hidden[s.name]; });
  }

  // --- drawing (browser only) -----------------------------------------------------------
  function draw(fig, d3, num) {
    var raw = fig.querySelector('script.dv-data');
    if (!raw) return;
    var spec;
    try { spec = JSON.parse(raw.textContent); } catch (e) { return; }
    var p = prepare(spec);
    if (!p.count) return;
    var host = fig.querySelector('.dv-chart');
    var legend = fig.querySelector('.dv-legend');
    var tip = fig.querySelector('.dv-tip');
    var hidden = {};
    var reduce = fig.ownerDocument.defaultView.matchMedia && fig.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var W = 720, H = spec.chart === 'scale' ? 90 + 40 * p.count : 340, M = { t: 16, r: 24, b: 42, l: 64 };

    function render() {
      host.textContent = '';
      var svg = d3.select(host).append('svg').attr('viewBox', '0 0 ' + W + ' ' + H).attr('role', 'img')
        .attr('aria-label', spec.title || '');
      var vis = visible(p, hidden);
      var pts = [].concat.apply([], vis.map(function (s) { return s.points.map(function (q) { return Object.assign({ color: s.color }, q); }); }));
      if (!pts.length) return;
      var g = svg.append('g');
      var dur = reduce ? 0 : 600;
      if (spec.chart === 'scale') {
        var pos = pts.filter(function (q) { return q.y > 0; });
        var x = d3.scaleLog().domain([d3.min(pos, function (q) { return q.y; }) / 1.5, d3.max(pos, function (q) { return q.y; }) * 1.5])
          .range([M.l, W - M.r]);
        g.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + (H - M.b) + ')')
          .call(d3.axisBottom(x).ticks(5).tickFormat(function (v) { return fmt(v, num); }));
        var row = g.selectAll('g.row').data(pos.sort(function (a, b) { return a.y - b.y; })).enter().append('g')
          .attr('class', 'row').attr('tabindex', 0)
          .attr('transform', function (q, i) { return 'translate(0,' + (M.t + 28 + i * 40) + ')'; });
        row.append('line').attr('x1', M.l).attr('x2', M.l).attr('stroke', '#00aaff55').attr('stroke-width', 6)
          .transition().duration(dur).attr('x2', function (q) { return x(q.y); });
        row.append('circle').attr('r', 6).attr('cx', function (q) { return x(q.y); }).attr('fill', '#d9b978');
        row.append('text').attr('x', M.l).attr('y', -10).attr('class', 'dv-label')          // above its bar, never on it
          .text(function (q) { return String(q.x) + ' · ' + fmt(q.y, num) + ' ' + (spec.unit || ''); });
        return;
      }
      var y = d3.scaleLinear().domain([Math.min(0, p.yMin), p.yMax * 1.08 || 1]).nice().range([H - M.b, M.t]);
      var x2;
      if (p.categorical || spec.chart === 'bar') {
        var cats = [];
        pts.forEach(function (q) { if (cats.indexOf(String(q.x)) < 0) cats.push(String(q.x)); });
        x2 = d3.scaleBand().domain(cats).range([M.l, W - M.r]).padding(0.25);
        var sub = d3.scaleBand().domain(vis.map(function (s) { return s.name; })).range([0, x2.bandwidth()]).padding(0.08);
        g.selectAll('rect').data(pts).enter().append('rect').attr('tabindex', 0)
          .attr('x', function (q) { return x2(String(q.x)) + sub(q.series); }).attr('width', sub.bandwidth())
          .attr('y', y(0)).attr('height', 0).attr('fill', function (q) { return q.color; }).attr('rx', 3)
          .transition().duration(dur).attr('y', function (q) { return y(Math.max(0, q.y)); })
          .attr('height', function (q) { return Math.abs(y(q.y) - y(0)); });
        g.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + (H - M.b) + ')').call(d3.axisBottom(x2))
          .selectAll('text').attr('transform', cats.length > 6 ? 'rotate(-25)' : null).style('text-anchor', cats.length > 6 ? 'end' : 'middle');
      } else {
        x2 = d3.scaleLinear().domain(d3.extent(pts, function (q) { return q.x; })).range([M.l, W - M.r]);
        var line = d3.line().x(function (q) { return x2(q.x); }).y(function (q) { return y(q.y); });
        vis.forEach(function (s) {
          if (spec.chart === 'area') {
            g.append('path').datum(s.points).attr('fill', s.color).attr('opacity', 0.18)
              .attr('d', d3.area().x(function (q) { return x2(q.x); }).y0(y(0)).y1(function (q) { return y(q.y); }));
          }
          if (spec.chart !== 'scatter') {
            var path = g.append('path').datum(s.points).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', 2.5).attr('d', line);
            var len = path.node().getTotalLength ? path.node().getTotalLength() : 0;
            if (len && dur) path.attr('stroke-dasharray', len + ' ' + len).attr('stroke-dashoffset', len).transition().duration(900).attr('stroke-dashoffset', 0);
          }
        });
        g.selectAll('circle').data(pts).enter().append('circle').attr('tabindex', 0)
          .attr('cx', function (q) { return x2(q.x); }).attr('cy', function (q) { return y(q.y); })
          .attr('r', spec.chart === 'scatter' ? 5 : 3.5).attr('fill', function (q) { return q.color; });
        g.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + (H - M.b) + ')')
          .call(d3.axisBottom(x2).ticks(7).tickFormat(function (v) { return Math.abs(v) < 3000 && v % 1 === 0 ? String(v) : fmt(v, num); }));
        var focus = g.append('line').attr('class', 'dv-focus').attr('y1', M.t).attr('y2', H - M.b).style('opacity', 0);
        svg.on('pointermove', function (ev) {
          var mx = d3.pointer(ev)[0];
          var near = pts.reduce(function (best, q) { return Math.abs(x2(q.x) - mx) < Math.abs(x2(best.x) - mx) ? q : best; }, pts[0]);
          focus.attr('x1', x2(near.x)).attr('x2', x2(near.x)).style('opacity', 1);
          var same = pts.filter(function (q) { return q.x === near.x; });
          tip.textContent = same.map(function (q) { return tooltipText(q, spec.unit, num); }).join('  |  ');
          tip.hidden = false;
        }).on('pointerleave', function () { focus.style('opacity', 0); tip.hidden = true; });
      }
      g.append('g').attr('class', 'axis').attr('transform', 'translate(' + M.l + ',0)')
        .call(d3.axisLeft(y).ticks(5).tickFormat(function (v) { return fmt(v, num); }));
      g.selectAll('[tabindex]').on('focus mouseenter', function (ev, q) {
        tip.textContent = tooltipText(q, spec.unit, num); tip.hidden = false;
      }).on('blur mouseleave', function () { tip.hidden = true; });
    }

    if (legend && p.series.length > 1) {
      p.series.forEach(function (s) {
        var b = fig.ownerDocument.createElement('button');
        b.type = 'button';
        b.className = 'dv-key';
        b.setAttribute('aria-pressed', 'true');
        b.style.setProperty('--c', s.color);
        b.textContent = s.name;
        b.addEventListener('click', function () {
          hidden = toggle(hidden, s.name);
          b.setAttribute('aria-pressed', hidden[s.name] ? 'false' : 'true');
          render();
        });
        legend.appendChild(b);
      });
    }
    render();
  }

  function init(doc, win, num) {
    var d3 = win && win.d3;
    if (!d3) return;
    Array.prototype.slice.call(doc.querySelectorAll('figure.dataviz')).forEach(function (fig) { draw(fig, d3, num); });
  }

  return { prepare: prepare, tooltipText: tooltipText, toggle: toggle, visible: visible, fmt: fmt, init: init };
});
