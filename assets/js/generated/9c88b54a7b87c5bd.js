
(function () {
  var SIZE = 8;

  var audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var now = audioCtx.currentTime;

    if (type === 'move') {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'capture') {
      // Soft two-note sine chime - replaces the old sharp square/sawtooth
      // "snap" with something gentler that still reads as a distinct cue.
      [660, 880].forEach(function (freq, i) {
        var delay = i * 0.03;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + delay);
        gain.gain.setValueAtTime(0.0001, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.22, now + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.22);
        osc.start(now + delay);
        osc.stop(now + delay + 0.24);
      });
    } else if (type === 'wave') {
      var osc2 = audioCtx.createOscillator();
      var gain2 = audioCtx.createGain();
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(440, now);
      osc2.frequency.exponentialRampToValueAtTime(880, now + 0.25);
      gain2.gain.setValueAtTime(0.2, now);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc2.start(now);
      osc2.stop(now + 0.25);
    } else if (type === 'gameover') {
      var osc3 = audioCtx.createOscillator();
      var gain3 = audioCtx.createGain();
      osc3.connect(gain3);
      gain3.connect(audioCtx.destination);
      osc3.type = 'sawtooth';
      osc3.frequency.setValueAtTime(300, now);
      osc3.frequency.linearRampToValueAtTime(60, now + 0.6);
      gain3.gain.setValueAtTime(0.6, now);
      gain3.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
      osc3.start(now);
      osc3.stop(now + 0.6);
    }
  }

  var PIECES = { P: '♟', R: '♜', N: '♞', B: '♝', Q: '♛', K: '♚',
                 p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' };

  var board = [];
  var selectedCell = null;
  var validMoves = [];
  var score = 0;
  var wave = 1;
  var isGameOver = false;
  var isAnimating = false;

  var boardEl = document.getElementById('cd-board');
  var waveEl = document.getElementById('cd-wave-val');
  var scoreEl = document.getElementById('cd-score-val');
  var enemiesEl = document.getElementById('cd-enemies-val');
  var stepBtn = document.getElementById('cd-step-btn');
  var waveOverlay = document.getElementById('cd-wave-overlay');
  var waveBannerText = document.getElementById('cd-wave-banner-text');

  function initGame() {
    score = 0;
    wave = 1;
    isGameOver = false;
    isAnimating = false;
    selectedCell = null;
    validMoves = [];
    createGrid();
    setupPlayerPieces();
    startWave();
  }

  function createGrid() {
    boardEl.innerHTML = '';
    board = Array(SIZE).fill(null).map(function () { return Array(SIZE).fill(null); });
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var cell = document.createElement('div');
        cell.classList.add('cd-cell');
        cell.classList.add((r + c) % 2 === 0 ? 'light' : 'dark');
        cell.dataset.row = r;
        cell.dataset.col = c;
        (function (rr, cc) { cell.addEventListener('click', function () { handleCellClick(rr, cc); }); })(r, c);
        boardEl.appendChild(cell);
      }
    }
  }

  function setupPlayerPieces() {
    var backRow = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    for (var c = 0; c < SIZE; c++) {
      board[6][c] = { type: 'P', side: 'player' };
      board[7][c] = { type: backRow[c], side: 'player' };
    }
  }

  function startWave() {
    var enemies = generateWaveEnemies(wave);
    playSound('wave');
    spawnEnemiesOnBoard(enemies);
    updateUI();
    renderBoard();
  }

  function generateWaveEnemies(waveNum) {
    var targetCount = waveNum * 2 - 1;
    var maxSets = targetCount <= 16 ? 1 : 2;
    var pieceLimits = { p: 8 * maxSets, n: 2 * maxSets, b: 2 * maxSets, r: 2 * maxSets, q: 1 * maxSets, k: 1 * maxSets };
    var counts = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
    var list = [];

    for (var i = 0; i < targetCount; i++) {
      var allowedTypes = [];
      if (counts.p < pieceLimits.p) allowedTypes.push('p');
      if (waveNum >= 2 && counts.n < pieceLimits.n) allowedTypes.push('n');
      if (waveNum >= 3 && counts.b < pieceLimits.b) allowedTypes.push('b');
      if (waveNum >= 4 && counts.r < pieceLimits.r) allowedTypes.push('r');
      if (waveNum >= 5 && counts.q < pieceLimits.q) allowedTypes.push('q');
      if (waveNum >= 6 && counts.k < pieceLimits.k) allowedTypes.push('k');
      if (allowedTypes.length === 0) {
        if (counts.p < pieceLimits.p) allowedTypes.push('p');
        else break;
      }
      var type = allowedTypes[Math.floor(Math.random() * allowedTypes.length)];
      counts[type]++;
      list.push(type);
    }
    return list;
  }

  function spawnEnemiesOnBoard(enemyList) {
    var enemiesToPlace = enemyList.slice();
    for (var r = 0; r < SIZE && enemiesToPlace.length > 0; r++) {
      var freeCellsInRow = [];
      for (var c = 0; c < SIZE; c++) {
        if (!board[r][c]) freeCellsInRow.push({ r: r, c: c });
      }
      freeCellsInRow.sort(function () { return Math.random() - 0.5; });
      while (freeCellsInRow.length > 0 && enemiesToPlace.length > 0) {
        var cell = freeCellsInRow.pop();
        var type = enemiesToPlace.pop();
        board[cell.r][cell.c] = { type: type, side: 'enemy' };
      }
    }
  }

  function handleCellClick(r, c) {
    if (isGameOver || isAnimating) return;
    var clickedPiece = board[r][c];

    if (clickedPiece && clickedPiece.side === 'player') {
      selectedCell = { r: r, c: c };
      validMoves = getValidMoves(r, c, clickedPiece.type, 'player');
      renderBoard();
      return;
    }

    if (selectedCell) {
      var isMoveValid = validMoves.some(function (m) { return m.r === r && m.c === c; });
      if (isMoveValid) {
        executeMove(selectedCell, { r: r, c: c });
        selectedCell = null;
        validMoves = [];
        processEnemyTurn();
        return;
      }
    }

    selectedCell = null;
    validMoves = [];
    renderBoard();
  }

  function executeMove(from, to) {
    var target = board[to.r][to.c];
    if (target) {
      playSound('capture');
      if (target.side === 'enemy') score += getPieceValue(target.type);
    } else {
      playSound('move');
    }
    board[to.r][to.c] = board[from.r][from.c];
    board[from.r][from.c] = null;
  }

  function processEnemyTurn() {
    var allPossibleEnemyMoves = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (board[r][c] && board[r][c].side === 'enemy') {
          var moves = getValidMoves(r, c, board[r][c].type, 'enemy');
          for (var m = 0; m < moves.length; m++) {
            var move = moves[m];
            var target = board[move.r][move.c];
            var isCapture = !!(target && target.side === 'player');
            var isKingCapture = isCapture && target.type === 'K';
            allPossibleEnemyMoves.push({ from: { r: r, c: c }, to: move, isCapture: isCapture, isKingCapture: isKingCapture, targetRow: move.r });
          }
        }
      }
    }

    if (allPossibleEnemyMoves.length > 0) {
      allPossibleEnemyMoves.sort(function (a, b) {
        if (a.isKingCapture !== b.isKingCapture) return b.isKingCapture - a.isKingCapture;
        if (a.isCapture !== b.isCapture) return b.isCapture - a.isCapture;
        return b.targetRow - a.targetRow;
      });

      var chosen = allPossibleEnemyMoves[0];
      var targetPiece = board[chosen.to.r][chosen.to.c];
      executeMove(chosen.from, chosen.to);

      if (targetPiece && targetPiece.type === 'K') {
        renderBoard();
        playSound('gameover');
        triggerGameOver('Your King has fallen!');
        return;
      }
    }

    if (countActiveEnemies() === 0) {
      var clearedWave = wave;
      wave++;
      score += 100 * wave;
      updateUI();
      renderBoard();
      triggerWaveClearAnimation(clearedWave, startWave);
    } else {
      updateUI();
      renderBoard();
    }
  }

  function triggerWaveClearAnimation(clearedWave, callback) {
    isAnimating = true;
    waveBannerText.textContent = 'WAVE ' + clearedWave + ' CLEARED';

    waveOverlay.querySelectorAll('.cd-particle').forEach(function (p) { p.remove(); });
    var particleCount = 24;
    for (var i = 0; i < particleCount; i++) {
      var p = document.createElement('div');
      p.className = 'cd-particle';
      var angle = (Math.PI * 2 * i) / particleCount;
      var dist = 90 + Math.random() * 60;
      p.style.setProperty('--px', (Math.cos(angle) * dist) + 'px');
      p.style.setProperty('--py', (Math.sin(angle) * dist) + 'px');
      p.style.animationDelay = (Math.random() * 0.15) + 's';
      waveOverlay.appendChild(p);
    }

    waveOverlay.classList.remove('show');
    void waveOverlay.offsetWidth; // restart CSS animation
    waveOverlay.classList.add('show');

    setTimeout(function () {
      waveOverlay.classList.remove('show');
      isAnimating = false;
      callback();
    }, 950);
  }

  function getValidMoves(r, c, type, side) {
    var moves = [];
    var enemySide = side === 'player' ? 'enemy' : 'player';

    function addMove(nr, nc) {
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
        var dest = board[nr][nc];
        if (!dest) { moves.push({ r: nr, c: nc }); return true; }
        else if (dest.side === enemySide) { moves.push({ r: nr, c: nc }); return false; }
      }
      return false;
    }

    function slide(directions) {
      directions.forEach(function (d) {
        var nr = r + d[0], nc = c + d[1];
        while (addMove(nr, nc)) { nr += d[0]; nc += d[1]; }
      });
    }

    var isPlayer = side === 'player';
    var fwd = isPlayer ? -1 : 1;

    switch (type.toUpperCase()) {
      case 'P':
        if (r + fwd >= 0 && r + fwd < SIZE && !board[r + fwd][c]) {
          moves.push({ r: r + fwd, c: c });
          var startRow = isPlayer ? 6 : 1;
          if (r === startRow && !board[r + (fwd * 2)][c]) moves.push({ r: r + (fwd * 2), c: c });
        }
        [-1, 1].forEach(function (dc) {
          var nr = r + fwd, nc = c + dc;
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
            if (board[nr][nc] && board[nr][nc].side === enemySide) moves.push({ r: nr, c: nc });
          }
        });
        break;
      case 'N':
        [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(function (d) { addMove(r + d[0], c + d[1]); });
        break;
      case 'B':
        slide([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
        break;
      case 'R':
        slide([[-1, 0], [1, 0], [0, -1], [0, 1]]);
        break;
      case 'Q':
        slide([[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]);
        break;
      case 'K':
        [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(function (d) { addMove(r + d[0], c + d[1]); });
        break;
    }
    return moves;
  }

  function renderBoard() {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var cell = getCellEl(r, c);
        cell.innerHTML = '';
        cell.className = 'cd-cell ' + ((r + c) % 2 === 0 ? 'light' : 'dark');

        var piece = board[r][c];
        if (piece) {
          var pieceEl = document.createElement('span');
          pieceEl.classList.add('cd-piece', piece.side);
          pieceEl.innerText = PIECES[piece.type];
          cell.appendChild(pieceEl);
        }

        if (selectedCell && selectedCell.r === r && selectedCell.c === c) cell.classList.add('selected');

        if (validMoves.some(function (m) { return m.r === r && m.c === c; })) {
          if (board[r][c] && board[r][c].side === 'enemy') cell.classList.add('valid-capture');
          else cell.classList.add('valid-move');
        }
      }
    }
  }

  function countActiveEnemies() {
    var count = 0;
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) if (board[r][c] && board[r][c].side === 'enemy') count++;
    return count;
  }

  function getPieceValue(type) {
    var values = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 100 };
    return values[type.toLowerCase()] || 10;
  }

  function getCellEl(r, c) { return boardEl.children[r * SIZE + c]; }

  function updateUI() {
    waveEl.innerText = wave;
    scoreEl.innerText = score;
    enemiesEl.innerText = countActiveEnemies();
  }

  function triggerGameOver(msg) {
    isGameOver = true;
    setTimeout(function () {
      alert('GAME OVER!\n' + msg + '\nFinal score: ' + score);
      initGame();
    }, 50);
  }

  stepBtn.addEventListener('click', function () {
    if (!isGameOver && !isAnimating) processEnemyTurn();
  });

  initGame();
})();
