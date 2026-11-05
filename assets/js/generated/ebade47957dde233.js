
  (function () {
    var m = window.location.pathname.match(/^\/(fr|it|ja|ko|pt)(\/.*)?$/);
    if (m) window.location.replace((m[2] || '/') + window.location.search + window.location.hash);
  })();
