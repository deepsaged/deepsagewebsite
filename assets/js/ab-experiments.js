(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.DsAbExperiments = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // Level 4a (client-side presentational A/B layer, see
  // docs/spec-mab-article-structure.md Phase E) -- bucket weights are
  // computed offline by the posting pipeline's Thompson sampling
  // (experiments.py) and shipped as a static /assets/experiments.json; this
  // module only does a single weighted-random draw from those precomputed
  // probabilities, persists the bucket, and mutates DOM nodes that are
  // already fully present in the raw HTML (per spec Assumption 9 -- no
  // content is ever injected here, only attributes/text/position of
  // existing nodes are changed, so the raw page source stays fully
  // readable/indexable with no JS execution required).

  var STORAGE_PREFIX = 'ds_experiment_';

  // Picks an arm from a {arm: probability} map (probabilities should sum to
  // ~1, but this normalizes defensively in case they don't). `rand` is
  // injectable for deterministic tests; defaults to Math.random.
  function weightedChoice(weights, rand) {
    rand = rand || Math.random;
    var arms = Object.keys(weights || {});
    if (arms.length === 0) return null;
    var total = 0;
    for (var i = 0; i < arms.length; i++) total += weights[arms[i]];
    if (total <= 0) return arms[0];

    var r = rand() * total;
    var cumulative = 0;
    for (var j = 0; j < arms.length; j++) {
      cumulative += weights[arms[j]];
      if (r < cumulative) return arms[j];
    }
    return arms[arms.length - 1];
  }

  // Once a visitor is bucketed into an experiment, they stay there for the
  // life of the browser storage -- re-drawing on every page view would
  // make the reward signal (which page/session a bucket "caused") noisy
  // and would flicker the UI between visits.
  function getOrAssignBucket(experimentName, weights, storage, rand) {
    var key = STORAGE_PREFIX + experimentName;
    var existing = storage.getItem(key);
    if (existing) return existing;

    var bucket = weightedChoice(weights, rand);
    if (bucket) storage.setItem(key, bucket);
    return bucket;
  }

  // cta_copy arms: control is today's shipped copy, "bold" is the
  // treatment. textContent-only swap on an already-rendered button --
  // never injects a node that isn't already in the raw HTML.
  var CTA_COPY_TEXT = {
    bold: 'Get smarter today',
  };

  function applyCtaCopyExperiment(button, arm) {
    if (!button) return;
    var text = CTA_COPY_TEXT[arm];
    if (text) button.textContent = text;
  }

  // Level 4b: reveals (or leaves hidden) an optional content block --
  // see docs/guide-level4b-optional-blocks.md. The block's full content is
  // always already in the raw HTML (rendered `hidden` by default, see
  // templates/article.html); this only ever toggles the `hidden`
  // attribute on a node that already exists, never injects content.
  function applyBlockVisibilityExperiment(block, arm) {
    if (!block) return;
    if (arm === 'shown') block.removeAttribute('hidden');
    else block.setAttribute('hidden', '');
  }

  var VISIBILITY_SUFFIX = '_visibility';

  // Reads every currently-persisted bucket back out of storage, keyed by
  // experiment name (without the ds_experiment_ prefix). Used to attach
  // {experiment: arm, ...} onto conversion events (sign_up, etc.) so GA4
  // can correlate exposure -> conversion per arm (Phase F reward
  // attribution -- see pipeline_article_rewards.py / a Level-4a-specific
  // reward job in the posting repo).
  function getActiveBuckets(storage) {
    var buckets = {};
    for (var i = 0; i < storage.length; i++) {
      var key = storage.key(i);
      if (key && key.indexOf(STORAGE_PREFIX) === 0) {
        buckets[key.slice(STORAGE_PREFIX.length)] = storage.getItem(key);
      }
    }
    return buckets;
  }

  // Entry point: fetches /assets/experiments.json, buckets the visitor into
  // every experiment it contains, applies known DOM mutations, and reports
  // the assignment via dsTrack for reward attribution (see
  // pipeline_article_rewards.py's Phase F extension).
  function init(config, doc, storage, dsTrack, rand) {
    doc = doc || document;
    storage = storage || window.localStorage;
    dsTrack = dsTrack || window.dsTrack || function () {};

    Object.keys(config || {}).forEach(function (experimentName) {
      var bucket = getOrAssignBucket(experimentName, config[experimentName], storage, rand);
      if (!bucket) return;

      if (experimentName === 'cta_copy') {
        applyCtaCopyExperiment(doc.querySelector('[data-experiment="cta_copy"]'), bucket);
      } else if (experimentName.indexOf(VISIBILITY_SUFFIX, experimentName.length - VISIBILITY_SUFFIX.length) !== -1) {
        var blockName = experimentName.slice(0, -VISIBILITY_SUFFIX.length);
        applyBlockVisibilityExperiment(doc.querySelector('[data-experiment-block="' + blockName + '"]'), bucket);
      }

      dsTrack('experiment_view', { experiment: experimentName, arm: bucket });
    });
  }

  return {
    weightedChoice: weightedChoice,
    getOrAssignBucket: getOrAssignBucket,
    applyCtaCopyExperiment: applyCtaCopyExperiment,
    applyBlockVisibilityExperiment: applyBlockVisibilityExperiment,
    getActiveBuckets: getActiveBuckets,
    init: init,
  };
});
