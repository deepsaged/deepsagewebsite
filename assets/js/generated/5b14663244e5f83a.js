
(function () {
  function NDimTicTacToe(dim, difficulty) {
    this.dim = dim || 3;
    this.difficulty = difficulty || 'smart';
    this.board = new Map();
    this.sliceCoords = new Array(Math.max(0, this.dim - 3)).fill(0);
    this.totalCells = Math.pow(3, this.dim);
    this.gameOver = false;
    this.winningLine = null;
    this.directions = this.generateDirections();
  }

  // Winning-line count grows as (5^N - 3^N)/2 (~122M lines at N=12), so lines
  // are never pre-enumerated. Instead we only ever compute the handful of
  // lines that pass through a specific cell, on demand.
  NDimTicTacToe.prototype.generateDirections = function () {
    var N = this.dim;
    var directions = [];
    function genDirs(currentDir) {
      if (currentDir.length === N) {
        var firstNonZero = currentDir.find(function (v) { return v !== 0; });
        if (firstNonZero === 1) directions.push(currentDir.slice());
        return;
      }
      [0, 1, -1].forEach(function (v) {
        currentDir.push(v);
        genDirs(currentDir);
        currentDir.pop();
      });
    }
    genDirs([]);
    return directions;
  };

  NDimTicTacToe.prototype.getCell = function (coordStr) { return this.board.get(coordStr) || null; };

  // Returns every winning line (array of coordStr arrays) that passes through coord.
  NDimTicTacToe.prototype.linesThroughCell = function (coord) {
    var N = this.dim;
    var lines = [];
    this.directions.forEach(function (dir) {
      var d0 = 0;
      while (d0 < N && dir[d0] === 0) d0++;
      if (d0 === N) return;
      var k = dir[d0] === 1 ? coord[d0] : 2 - coord[d0];
      if (k < 0 || k > 2) return;
      var start = new Array(N);
      var valid = true;
      for (var d = 0; d < N; d++) {
        start[d] = coord[d] - k * dir[d];
        if (dir[d] === 1 && start[d] !== 0) { valid = false; break; }
        if (dir[d] === -1 && start[d] !== 2) { valid = false; break; }
        if (dir[d] === 0 && start[d] !== coord[d]) { valid = false; break; }
      }
      if (!valid) return;
      var line = [];
      for (var step = 0; step < 3; step++) {
        var cell = start.map(function (val, d) { return val + step * dir[d]; });
        line.push(cell.join(','));
      }
      lines.push(line);
    });
    return lines;
  };

  NDimTicTacToe.prototype.makeMove = function (coordStr, player) {
    if (this.gameOver || this.board.has(coordStr)) return false;
    this.board.set(coordStr, player);
    var coord = coordStr.split(',').map(Number);
    var win = this.checkWin(player, coord);
    if (win) { this.gameOver = true; this.winningLine = win; }
    else if (this.board.size === this.totalCells) this.gameOver = true;
    return true;
  };

  // A win must include the cell just played, so only lines through it need checking.
  NDimTicTacToe.prototype.checkWin = function (player, coord) {
    var board = this.board;
    var lines = this.linesThroughCell(coord);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.every(function (c) { return board.get(c) === player; })) return line;
    }
    return null;
  };

  // Candidate lines are gathered only from cells already on the board (both
  // colors), which bounds the search by (stones played * directions) instead
  // of the full combinatorial line count.
  NDimTicTacToe.prototype.candidateLines = function () {
    var board = this.board;
    var seen = new Set();
    var lines = [];
    board.forEach(function (_player, coordStr) {
      var coord = coordStr.split(',').map(Number);
      this.linesThroughCell(coord).forEach(function (line) {
        var key = line.join('|');
        if (seen.has(key)) return;
        seen.add(key);
        lines.push(line);
      });
    }, this);
    return lines;
  };

  NDimTicTacToe.prototype.getAIMove = function () {
    if (this.gameOver) return null;
    var board = this.board;
    var lines = this.candidateLines();

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var oCount = line.filter(function (c) { return board.get(c) === 'O'; }).length;
      var empty = line.filter(function (c) { return !board.has(c); });
      if (oCount === 2 && empty.length === 1) return empty[0];
    }

    for (var j = 0; j < lines.length; j++) {
      var line2 = lines[j];
      var xCount = line2.filter(function (c) { return board.get(c) === 'X'; }).length;
      var empty2 = line2.filter(function (c) { return !board.has(c); });
      if (xCount === 2 && empty2.length === 1) return empty2[0];
    }

    if (this.difficulty === 'easy') return this.getRandomMove();

    var cellScores = new Map();
    lines.forEach(function (line) {
      var xCount = line.filter(function (c) { return board.get(c) === 'X'; }).length;
      var oCount = line.filter(function (c) { return board.get(c) === 'O'; }).length;
      if (xCount === 0) {
        var score = oCount === 1 ? 5 : 1;
        line.forEach(function (coord) {
          if (!board.has(coord)) cellScores.set(coord, (cellScores.get(coord) || 0) + score);
        });
      }
    });

    if (cellScores.size > 0) {
      var bestScore = -1, bestCoords = [];
      cellScores.forEach(function (score, coord) {
        if (score > bestScore) { bestScore = score; bestCoords = [coord]; }
        else if (score === bestScore) bestCoords.push(coord);
      });
      return bestCoords[Math.floor(Math.random() * bestCoords.length)];
    }

    return this.getRandomMove();
  };

  NDimTicTacToe.prototype.getRandomMove = function () {
    var board = this.board;
    var emptyCells = [];
    var dim = this.dim;
    function genAll(curr) {
      if (curr.length === dim) {
        var key = curr.join(',');
        if (!board.has(key)) emptyCells.push(key);
        return;
      }
      for (var i = 0; i < 3; i++) { curr.push(i); genAll(curr); curr.pop(); }
    }
    genAll([]);
    return emptyCells.length > 0 ? emptyCells[Math.floor(Math.random() * emptyCells.length)] : null;
  };

  var game = null;
  var dimSlider = document.getElementById('ht-dim-slider');
  var dimValue = document.getElementById('ht-dim-value');
  var aiDifficulty = document.getElementById('ht-ai-difficulty');
  var resetBtn = document.getElementById('ht-reset-btn');
  var statusPanel = document.getElementById('ht-status-panel');
  var navPanel = document.getElementById('ht-nav-panel');
  var gameBoard = document.getElementById('ht-game-board');

  function initGame() {
    var dim = parseInt(dimSlider.value, 10);
    var diff = aiDifficulty.value;
    game = new NDimTicTacToe(dim, diff);
    renderNavigation();
    renderBoard();
    updateStatus('Your turn (X)');
  }

  function updateStatus(msg) {
    if (game.winningLine) {
      var winner = game.board.get(game.winningLine[0]);
      statusPanel.textContent = winner === 'X' ? 'You win!' : 'Computer wins!';
      statusPanel.style.color = winner === 'X' ? 'var(--teal)' : '#ff6677';
    } else if (game.gameOver) {
      statusPanel.textContent = "It's a draw!";
      statusPanel.style.color = 'var(--muted)';
    } else {
      statusPanel.textContent = msg;
      statusPanel.style.color = 'var(--text)';
    }
  }

  function renderNavigation() {
    navPanel.innerHTML = '';
    if (game.dim <= 3) { navPanel.style.display = 'none'; return; }
    navPanel.style.display = 'flex';
    for (var d = 4; d <= game.dim; d++) {
      (function (d) {
        var navGroup = document.createElement('div');
        navGroup.className = 'ht-slice-selector';
        var label = document.createElement('span');
        label.textContent = 'Dim ' + d + ' index:';
        navGroup.appendChild(label);
        var optionsWrap = document.createElement('div');
        optionsWrap.className = 'ht-slice-options';
        var groupName = 'ht-slice-dim-' + d;
        var current = game.sliceCoords[d - 4] || 0;
        for (var i = 0; i < 3; i++) {
          var optLabel = document.createElement('label');
          optLabel.className = 'ht-slice-option';
          var radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = groupName;
          radio.value = i;
          if (i === current) radio.checked = true;
          radio.addEventListener('change', function (e) {
            game.sliceCoords[d - 4] = parseInt(e.target.value, 10);
            renderBoard();
          });
          var text = document.createElement('span');
          text.textContent = i;
          optLabel.appendChild(radio);
          optLabel.appendChild(text);
          optionsWrap.appendChild(optLabel);
        }
        navGroup.appendChild(optionsWrap);
        navPanel.appendChild(navGroup);
      })(d);
    }
  }

  function renderBoard() {
    gameBoard.innerHTML = '';
    var numGrids = game.dim === 2 ? 1 : 3;

    for (var z = 0; z < numGrids; z++) {
      var gridWrapper = document.createElement('div');
      gridWrapper.className = 'ht-grid-wrapper';

      if (game.dim >= 3) {
        var label = document.createElement('div');
        label.className = 'ht-grid-label';
        label.textContent = game.dim > 3
          ? 'Slice [*, *, ' + z + ', ' + game.sliceCoords.join(', ') + ']'
          : 'Layer Z = ' + z;
        gridWrapper.appendChild(label);
      }

      var grid = document.createElement('div');
      grid.className = 'ht-grid-3x3';

      for (var y = 0; y < 3; y++) {
        for (var x = 0; x < 3; x++) {
          (function (x, y, z) {
            var cell = document.createElement('div');
            cell.className = 'ht-cell';

            var coord = [x, y];
            if (game.dim >= 3) coord.push(z);
            if (game.dim >= 4) coord = coord.concat(game.sliceCoords);

            var coordStr = coord.join(',');
            var val = game.getCell(coordStr);

            if (val) {
              cell.textContent = val;
              cell.classList.add(val.toLowerCase(), 'occupied');
            }
            if (game.winningLine && game.winningLine.indexOf(coordStr) !== -1) cell.classList.add('winning');
            if (game.gameOver) cell.classList.add('disabled');

            cell.addEventListener('click', function () { handleCellClick(coordStr); });
            grid.appendChild(cell);
          })(x, y, z);
        }
      }

      gridWrapper.appendChild(grid);
      gameBoard.appendChild(gridWrapper);
    }
  }

  function handleCellClick(coordStr) {
    if (game.gameOver || game.board.has(coordStr)) return;
    game.makeMove(coordStr, 'X');
    renderBoard();
    if (game.gameOver) { updateStatus(); return; }

    updateStatus('Computer is thinking...');
    setTimeout(function () {
      var aiMove = game.getAIMove();
      if (aiMove) { game.makeMove(aiMove, 'O'); renderBoard(); }
      updateStatus(game.gameOver ? null : 'Your turn (X)');
    }, 150);
  }

  dimSlider.addEventListener('input', function (e) { dimValue.textContent = e.target.value; });
  dimSlider.addEventListener('change', initGame);
  aiDifficulty.addEventListener('change', initGame);
  resetBtn.addEventListener('click', initGame);

  initGame();
})();
