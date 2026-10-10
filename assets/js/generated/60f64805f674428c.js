
/* ── Star field canvas ── */
(function() {
  const canvas = document.getElementById('starCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, stars, shooters;

  function randShooter() {
    return {
      x:   W * 0.1 + Math.random() * W * 0.8,
      y:   -80,
      vx:  (Math.random() - 0.5) * 1.0,
      vy:  2.5 + Math.random() * 3.5,
      len: 60 + Math.random() * 50,
      op:  0,
      col: ['#00ffcc','#ffffff','#00aaff'][Math.random() * 3 | 0],
    };
  }

  function init() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
    stars = Array.from({ length: 280 }, () => ({
      x:   Math.random() * W,
      y:   Math.random() * H,
      r:   Math.random() * 1.3 + 0.2,
      op:  Math.random() * 0.55 + 0.2,
      tw:  Math.random() * Math.PI * 2,
      teal: Math.random() < 0.08,
    }));
    shooters = [randShooter(), randShooter(), randShooter()];
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    stars.forEach(s => {
      s.tw += 0.009;
      const t = 0.5 + 0.5 * Math.sin(s.tw);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.teal
        ? `rgba(0,255,204,${(s.op * t * 0.7).toFixed(2)})`
        : `rgba(255,255,255,${(s.op * t).toFixed(2)})`;
      ctx.fill();
    });

    shooters.forEach((s, i) => {
      s.x += s.vx; s.y += s.vy;
      s.op = Math.min(1, s.op + 0.04);
      if (s.y > H + 100) shooters[i] = randShooter();
      const a  = Math.atan2(s.vy, s.vx);
      const x0 = s.x - Math.cos(a) * s.len;
      const y0 = s.y - Math.sin(a) * s.len;
      const g  = ctx.createLinearGradient(x0, y0, s.x, s.y);
      g.addColorStop(0, 'transparent');
      g.addColorStop(1, s.col + 'bb');
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(s.x, s.y);
      ctx.strokeStyle = g;
      ctx.lineWidth   = 1.5;
      ctx.globalAlpha = s.op;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', init);
  init();
  draw();
})();
