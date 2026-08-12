/* Rupture Pattern System — guardian AI engine.
 *
 * Every guardian's moveFn(round, history, matchSeed) is a PURE, DETERMINISTIC
 * function: same inputs always produce the same output, and this file never
 * calls nondeterministic random functions. The only source of "opening move"
 * variation is matchSeed, a plain number the page controller picks once per
 * match (Date.now() at match start) and passes into every moveFn call for that
 * match. See docs/superpowers/specs/2026-08-11-minigames-design.md section 4
 * for the full design rationale.
 */
(function (root) {
  'use strict';

  var MOVES = ['R', 'P', 'S'];
  var COUNTER = { R: 'P', P: 'S', S: 'R' };

  function beats(a, b) {
    return (a === 'R' && b === 'S') || (a === 'S' && b === 'P') || (a === 'P' && b === 'R');
  }

  function counterOf(move) {
    return COUNTER[move];
  }

  function resultOf(playerMove, guardianMove) {
    if (playerMove === guardianMove) return 'draw';
    return beats(playerMove, guardianMove) ? 'win' : 'lose';
  }

  // mulberry32: small, fast, deterministic PRNG. Used ONLY to turn a fixed
  // (matchSeed, salt) pair into a reproducible "looks random" opening move —
  // never called with a nondeterministic seed.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededMove(matchSeed, salt) {
    var rand = mulberry32((matchSeed + salt) >>> 0);
    return MOVES[Math.floor(rand() * 3)];
  }

  function last(history, back) {
    back = back || 1;
    return history.length >= back ? history[history.length - back] : null;
  }

  var GUARDIANS = [
    {
      id: 1, name: 'Sentinel',
      tagline: 'Minimal daemon. No adaptive logic.',
      rule: 'Always plays Rock.',
      moveFn: function () { return 'R'; }
    },
    {
      id: 2, name: 'Cycler',
      tagline: 'Rotates through a fixed loop.',
      rule: 'Repeats Rock, Paper, Scissors in order.',
      moveFn: function (round) { return MOVES[(round - 1) % 3]; }
    },
    {
      id: 3, name: 'Reverse Cycler',
      tagline: 'Same loop, the other direction.',
      rule: 'Repeats Scissors, Paper, Rock in order.',
      moveFn: function (round) { return ['S', 'P', 'R'][(round - 1) % 3]; }
    },
    {
      id: 4, name: 'Mirror',
      tagline: 'Copies what it just saw.',
      rule: "Plays your previous throw. Opens on a seeded throw.",
      moveFn: function (round, history, matchSeed) {
        var l = last(history, 1);
        return l !== null ? l : seededMove(matchSeed, 4);
      }
    },
    {
      id: 5, name: 'Counter-Last',
      tagline: 'Punishes your last move.',
      rule: 'Plays the move that beats your previous throw.',
      moveFn: function (round, history, matchSeed) {
        var l = last(history, 1);
        return l !== null ? counterOf(l) : seededMove(matchSeed, 5);
      }
    },
    {
      id: 6, name: 'Counter-Lag2',
      tagline: 'Has a two-round memory.',
      rule: 'Plays the move that beats your throw from two rounds back.',
      moveFn: function (round, history, matchSeed) {
        var l = last(history, 2);
        return l !== null ? counterOf(l) : seededMove(matchSeed, 6);
      }
    },
    {
      id: 7, name: 'Parity Switch',
      tagline: 'Alternates its own strategy by round.',
      rule: 'On even rounds it counters your last throw; on odd rounds it mirrors it.',
      moveFn: function (round, history, matchSeed) {
        var l = last(history, 1);
        if (l === null) return seededMove(matchSeed, 7);
        return round % 2 === 0 ? counterOf(l) : l;
      }
    },
    {
      id: 8, name: 'Clockwork',
      tagline: 'Ignores you completely.',
      rule: "Plays a fixed formula on the round number alone - your moves are irrelevant.",
      moveFn: function (round) { return MOVES[(round * 2 + 1) % 3]; }
    },
    {
      id: 9, name: 'Echo Counter',
      tagline: 'Reasons two layers deep.',
      rule: 'Plays the move that beats whatever beat your throw two rounds ago.',
      moveFn: function (round, history, matchSeed) {
        var l = last(history, 2);
        return l !== null ? counterOf(counterOf(l)) : seededMove(matchSeed, 9);
      }
    },
    {
      id: 10, name: 'Anti-Streak',
      tagline: 'Watches for repetition.',
      rule: 'If your last two throws matched, it counters that throw; otherwise it counters your throw-before-last.',
      moveFn: function (round, history, matchSeed) {
        var a = last(history, 1), b = last(history, 2);
        if (a === null || b === null) return seededMove(matchSeed, 10);
        return counterOf(a === b ? a : b);
      }
    },
    {
      id: 11, name: 'Session Seed',
      tagline: 'A fixed sequence, different every match.',
      rule: 'Plays a sequence derived once from the match start time - identical every time this match replays a given round, but the whole sequence changes next match.',
      moveFn: function (round, history, matchSeed) { return seededMove(matchSeed, round * 2654435761); }
    },
    {
      id: 12, name: 'Composite',
      tagline: 'The system core. Everything at once.',
      rule: "Counters your single most-frequent throw so far; ties are broken the same way Anti-Streak resolves them.",
      moveFn: function (round, history, matchSeed) {
        if (history.length === 0) return seededMove(matchSeed, 12);
        var counts = { R: 0, P: 0, S: 0 };
        history.forEach(function (m) { counts[m]++; });
        var maxCount = -1, candidates = [];
        MOVES.forEach(function (m) {
          if (counts[m] > maxCount) { maxCount = counts[m]; candidates = [m]; }
          else if (counts[m] === maxCount) { candidates.push(m); }
        });
        if (candidates.length === 1) return counterOf(candidates[0]);
        var a = last(history, 1), b = last(history, 2);
        if (b === null) return counterOf(a);
        return counterOf(a === b ? a : b);
      }
    }
  ];

  var RuptureEngine = {
    MOVES: MOVES,
    beats: beats,
    counterOf: counterOf,
    resultOf: resultOf,
    mulberry32: mulberry32,
    GUARDIANS: GUARDIANS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RuptureEngine;
  } else {
    root.RuptureEngine = RuptureEngine;
  }
})(typeof window !== 'undefined' ? window : globalThis);
