
(function () {
  var engine = window.RuptureEngine;
  var ROUNDS_PER_MATCH = 10;
  var WINS_NEEDED = 9;
  var MOVE_LABEL = { R: 'Rock', P: 'Paper', S: 'Scissors' };

  var state = { currentNode: 0, cleared: [] };
  var match = null; // { guardian, round, history, matchSeed, wins, log }

  var ladderEl = document.getElementById('rp-ladder');
  var matchEl = document.getElementById('rp-match');
  var resultEl = document.getElementById('rp-result');
  var portraitImg = document.getElementById('rp-portrait-img');
  var portraitFallback = document.getElementById('rp-portrait-fallback');
  var nameEl = document.getElementById('rp-guardian-name');
  var taglineEl = document.getElementById('rp-guardian-tagline');
  var tallyEl = document.getElementById('rp-tally');
  var logEl = document.getElementById('rp-log');

  function renderLadder() {
    resultEl.style.display = 'none';
    matchEl.style.display = 'none';
    ladderEl.style.display = 'grid';
    ladderEl.innerHTML = '';

    engine.GUARDIANS.forEach(function (g, i) {
      var cleared = state.cleared.indexOf(i) !== -1;
      var isCurrent = i === state.currentNode;
      var locked = i > state.currentNode;
      var tile = document.createElement('div');
      tile.className = 'rp-node' +
        (cleared ? ' rp-node-cleared' : '') +
        (isCurrent ? ' rp-node-current' : '') +
        (locked ? ' rp-node-locked' : '');
      var numLabel = (i + 1 < 10 ? '0' : '') + (i + 1);
      var nameLabel = locked ? 'LOCKED' : g.name;
      tile.innerHTML =
        '<div class="rp-node-num">NODE ' + numLabel + '</div>' +
        '<div class="rp-node-name">' + nameLabel + '</div>';
      if (isCurrent) {
        tile.addEventListener('click', function () { startMatch(i); });
      }
      ladderEl.appendChild(tile);
    });
  }

  function startMatch(nodeIndex) {
    var guardian = engine.GUARDIANS[nodeIndex];
    match = {
      nodeIndex: nodeIndex,
      guardian: guardian,
      round: 1,
      history: [],
      matchSeed: Date.now(),
      wins: 0,
      log: []
    };

    ladderEl.style.display = 'none';
    resultEl.style.display = 'none';
    matchEl.style.display = 'block';

    var numLabel = (nodeIndex + 1 < 10 ? '0' : '') + (nodeIndex + 1);
    portraitImg.src = '/minigames/rupture-pattern-system/guardians/guardian-' + numLabel + '.webp';
    portraitImg.style.display = 'block';
    portraitFallback.textContent = numLabel;
    portraitImg.onerror = function () { portraitImg.style.display = 'none'; };

    nameEl.textContent = 'Node ' + numLabel + ' - ' + guardian.name;
    taglineEl.textContent = guardian.tagline;
    logEl.innerHTML = '';
    updateTally();
  }

  function updateTally() {
    tallyEl.textContent = 'Round ' + match.round + ' / ' + ROUNDS_PER_MATCH + ' · Wins ' + match.wins;
  }

  function playRound(playerMove) {
    if (!match) return;
    var guardianMove = match.guardian.moveFn(match.round, match.history.slice(), match.matchSeed);
    var result = engine.resultOf(playerMove, guardianMove);
    if (result === 'win') match.wins++;

    var row = document.createElement('div');
    row.className = 'rp-log-row' + (result === 'win' ? ' rp-log-win' : result === 'lose' ? ' rp-log-lose' : '');
    row.textContent = 'Round ' + match.round + ': you ' + MOVE_LABEL[playerMove] + ' vs ' + MOVE_LABEL[guardianMove] + ' - ' + result.toUpperCase();
    logEl.insertBefore(row, logEl.firstChild);

    match.history.push(playerMove);
    match.round++;
    updateTally();

    if (match.round > ROUNDS_PER_MATCH) {
      finishMatch();
    }
  }

  function finishMatch() {
    matchEl.style.display = 'none';
    resultEl.style.display = 'block';
    var breached = match.wins >= WINS_NEEDED;
    var titleEl = document.getElementById('rp-result-title');
    var subEl = document.getElementById('rp-result-sub');
    var btn = document.getElementById('rp-result-btn');

    if (breached) {
      if (state.cleared.indexOf(match.nodeIndex) === -1) state.cleared.push(match.nodeIndex);
      var isLast = match.nodeIndex === engine.GUARDIANS.length - 1;
      titleEl.textContent = isLast ? 'SYSTEM ROOT ACCESS' : 'NODE BREACHED';
      subEl.textContent = 'Final tally: ' + match.wins + ' / ' + ROUNDS_PER_MATCH + ' wins.' +
        (isLast ? ' All 12 guardians down.' : '');
      btn.textContent = isLast ? 'Back to Ladder' : 'Continue';
      btn.onclick = function () {
        if (!isLast) state.currentNode = match.nodeIndex + 1;
        match = null;
        renderLadder();
      };
    } else {
      var nodeNumLabel = (match.nodeIndex + 1 < 10 ? '0' : '') + (match.nodeIndex + 1);
      titleEl.textContent = 'CONNECTION SEVERED';
      subEl.textContent = 'Final tally: ' + match.wins + ' / ' + ROUNDS_PER_MATCH + ' wins. Needed ' + WINS_NEEDED + '. Node ' + nodeNumLabel + ' still holds.';
      btn.textContent = 'Retry Node ' + nodeNumLabel;
      btn.onclick = function () {
        match = null;
        renderLadder();
      };
    }
  }

  document.querySelectorAll('.rp-move-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { playRound(btn.dataset.move); });
  });

  renderLadder();
})();
