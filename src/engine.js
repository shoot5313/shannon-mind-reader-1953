(function attachMindReader(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.MindReader = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createApi() {
  "use strict";

  const LEFT = "L";
  const RIGHT = "R";
  const SHANNON_CELL_ORDER = Object.freeze(["WSW", "WSL", "WDW", "WDL", "LSW", "LSL", "LDW", "LDL"]);
  const COLLECTION_STORAGE_KEY = "shannon-mind-reader.collection.v2";
  const LEGACY_COLLECTION_STORAGE_KEY = "shannon-mind-reader.collection.v1";
  const COLLECTION_ITEMS = Object.freeze([
    Object.freeze({
      id: "ember-coins", code: "A-01", group: "treasure", name: "余烬金币",
      hint: "至少带着 1 盏命灯抵达",
      lore: "从熄灯后的余温里回收。它证明至少有一条航迹穿过了香农海峡。",
    }),
    Object.freeze({
      id: "relay-compass", code: "A-02", group: "treasure", name: "继电罗盘",
      hint: "至少带着 2 盏命灯抵达",
      lore: "指针不找北，只朝机器刚刚学会的局面轻轻偏转。",
    }),
    Object.freeze({
      id: "shannon-key", code: "A-03", group: "treasure", name: "香农密钥",
      hint: "带着 3 盏命灯抵达",
      lore: "三盏灯都亮着时才会显形，但它从不替持有人选择左或右。",
    }),
    Object.freeze({
      id: "question-manuscript", code: "A-04", group: "treasure", name: "问号原稿",
      hint: "100 海里 · 红光锁定 0 次",
      lore: "纸页没有一处红色批注，只在边缘留下八枚继电孔。",
    }),
    Object.freeze({
      id: "shannon-breaker", code: "B-08A", group: "seal", name: "香农破解章",
      hint: "CASE 8 · 领先还不是终点",
      lore: "机器承认这份成绩里有真本事，也有几次无法预知的盲猜。",
    }),
    Object.freeze({
      id: "most-wanted", code: "B-08B", group: "seal", name: "重点观察章",
      hint: "CASE 8 · 从另一端撞开档案",
      lore: "这不是安慰奖。它证明机器曾把一名人类读得足够彻底。",
    }),
  ]);

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function random() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normaliseLogWeights(logWeights) {
    const max = Math.max(...logWeights);
    const raw = logWeights.map((weight) => Math.exp(weight - max));
    const total = raw.reduce((sum, weight) => sum + weight, 0);
    return raw.map((weight) => weight / total);
  }

  function createPredictor(options = {}) {
    const maxOrder = Number.isInteger(options.maxOrder) ? options.maxOrder : 5;
    const eta = typeof options.eta === "number" ? options.eta : 0.85;
    const seed = Number.isInteger(options.seed) ? options.seed : Date.now();
    const random = mulberry32(seed);
    const history = [];
    const tables = Array.from({ length: maxOrder + 1 }, () => new Map());
    const logWeights = Array(maxOrder + 1).fill(0);
    let pending = null;

    function contextFor(order) {
      if (order === 0) return "*";
      if (history.length < order) return null;
      return history.slice(history.length - order).join("");
    }

    function probabilityFor(order) {
      const context = contextFor(order);
      if (context === null) return 0.5;
      const counts = tables[order].get(context) || [0, 0];
      return (counts[1] + 0.5) / (counts[0] + counts[1] + 1);
    }

    function predict() {
      if (pending) return pending;

      const expertProbabilities = Array.from(
        { length: maxOrder + 1 },
        (_, order) => probabilityFor(order),
      );
      const weights = normaliseLogWeights(logWeights);
      const probabilityRight = expertProbabilities.reduce(
        (sum, probability, order) => sum + probability * weights[order],
        0,
      );

      let choice;
      if (Math.abs(probabilityRight - 0.5) < 1e-12) {
        choice = random() < 0.5 ? LEFT : RIGHT;
      } else {
        choice = probabilityRight > 0.5 ? RIGHT : LEFT;
      }

      pending = Object.freeze({
        index: history.length + 1,
        choice,
        probabilityRight,
        confidence: Math.max(probabilityRight, 1 - probabilityRight),
        expertProbabilities: Object.freeze(expertProbabilities.slice()),
        weights: Object.freeze(weights.slice()),
      });

      return pending;
    }

    function observe(choice) {
      if (choice !== LEFT && choice !== RIGHT) {
        throw new TypeError('choice must be "L" or "R"');
      }

      const prediction = predict();
      const actualIndex = choice === RIGHT ? 1 : 0;

      prediction.expertProbabilities.forEach((probabilityRight, order) => {
        const probabilityActual = actualIndex === 1
          ? probabilityRight
          : 1 - probabilityRight;
        logWeights[order] += eta * Math.log(clamp(probabilityActual, 1e-9, 1));
      });

      const maxWeight = Math.max(...logWeights);
      logWeights.forEach((_, order) => {
        logWeights[order] -= maxWeight;
      });

      for (let order = 0; order <= maxOrder; order += 1) {
        const context = contextFor(order);
        if (context === null) continue;
        const counts = tables[order].get(context) || [0, 0];
        counts[actualIndex] += 1;
        tables[order].set(context, counts);
      }

      history.push(choice);
      pending = null;

      return Object.freeze({
        index: prediction.index,
        predicted: prediction.choice,
        actual: choice,
        correct: prediction.choice === choice,
        probabilityRight: prediction.probabilityRight,
        confidence: prediction.confidence,
      });
    }

    function snapshot() {
      return Object.freeze({
        history: Object.freeze(history.slice()),
        logWeights: Object.freeze(logWeights.slice()),
      });
    }

    return Object.freeze({ predict, observe, snapshot });
  }

  /*
   * Claude Shannon's eight-cell strategy from "A Mind-Reading (?) Machine"
   * (Bell Laboratories memorandum, 1953). A state is the player's outcome on
   * each of the previous two rounds plus whether they stayed or switched
   * between them. The machine trusts a reaction only after it repeats twice.
   */
  function createShannonPredictor(options = {}) {
    const seed = Number.isInteger(options.seed) ? options.seed : Date.now();
    const random = mulberry32(seed);
    const records = [];
    const cells = new Map();
    let pending = null;

    function opposite(choice) {
      return choice === LEFT ? RIGHT : LEFT;
    }

    function playerOutcome(record) {
      return record.correct ? "L" : "W";
    }

    function stateForNextMove() {
      if (records.length < 2) return null;
      const older = records[records.length - 2];
      const recent = records[records.length - 1];
      const transition = older.actual === recent.actual ? "S" : "D";
      return `${playerOutcome(older)}${transition}${playerOutcome(recent)}`;
    }

    function predict() {
      if (pending) return pending;

      const state = stateForNextMove();
      const cell = state === null ? null : cells.get(state);
      const trained = Boolean(cell && cell.repeated);
      const previous = records.length ? records[records.length - 1].actual : null;
      const predictedReaction = trained ? cell.reaction : null;
      const choice = trained
        ? predictedReaction === "S" ? previous : opposite(previous)
        : random() < 0.5 ? LEFT : RIGHT;
      const probabilityRight = trained ? (choice === RIGHT ? 1 : 0) : 0.5;

      pending = Object.freeze({
        index: records.length + 1,
        choice,
        probabilityRight,
        confidence: trained ? 1 : 0.5,
        state,
        trained,
        predictedReaction,
        cell: cell ? Object.freeze({ reaction: cell.reaction, repeated: cell.repeated }) : null,
      });
      return pending;
    }

    function observe(choice) {
      if (choice !== LEFT && choice !== RIGHT) {
        throw new TypeError('choice must be "L" or "R"');
      }

      const prediction = predict();
      const previous = records.length ? records[records.length - 1].actual : null;
      const reaction = previous === null ? null : choice === previous ? "S" : "D";
      const record = Object.freeze({
        index: prediction.index,
        predicted: prediction.choice,
        actual: choice,
        correct: prediction.choice === choice,
        probabilityRight: prediction.probabilityRight,
        confidence: prediction.confidence,
        state: prediction.state,
        trained: prediction.trained,
        predictedReaction: prediction.predictedReaction,
        reaction,
      });

      if (prediction.state !== null) {
        const cell = cells.get(prediction.state) || { reaction: null, repeated: false };
        if (cell.reaction === reaction) {
          cell.repeated = true;
        } else {
          cell.reaction = reaction;
          cell.repeated = false;
        }
        cells.set(prediction.state, cell);
      }

      records.push(record);
      pending = null;
      return record;
    }

    function snapshot() {
      return Object.freeze({
        history: Object.freeze(records.map((record) => record.actual)),
        records: Object.freeze(records.slice()),
        cells: Object.freeze(Array.from(cells, ([state, cell]) => Object.freeze({
          state,
          reaction: cell.reaction,
          repeated: cell.repeated,
        }))),
      });
    }

    return Object.freeze({ predict, observe, snapshot });
  }

  function summariseShannonVisits(records, options = {}) {
    if (!Array.isArray(records)) {
      throw new TypeError("records must be an array");
    }

    const minimumReadableVisits = Number.isInteger(options.minimumReadableVisits)
      ? options.minimumReadableVisits
      : 4;
    const counts = new Map(SHANNON_CELL_ORDER.map((state) => [state, 0]));
    const hitCounts = new Map(SHANNON_CELL_ORDER.map((state) => [state, 0]));
    for (const record of records) {
      if (record && counts.has(record.state)) {
        counts.set(record.state, counts.get(record.state) + 1);
        if (record.correct === true) {
          hitCounts.set(record.state, hitCounts.get(record.state) + 1);
        }
      }
    }

    const entries = SHANNON_CELL_ORDER.map((state) => {
      const count = counts.get(state);
      const hits = hitCounts.get(state);
      return Object.freeze({
        state,
        count,
        hits,
        hitRate: count === 0 ? null : hits / count,
      });
    });
    const hottest = entries.reduce((best, entry) => entry.count > best.count ? entry : best, entries[0]);
    const coldest = entries.reduce((best, entry) => entry.count < best.count ? entry : best, entries[0]);
    const total = entries.reduce((sum, entry) => sum + entry.count, 0);

    /*
     * The readability reveal exposes how often the player was caught in each
     * cell — their own transparency — never what the cell remembered.
     */
    const mostReadable = entries.reduce((best, entry) => {
      // A cell the machine never won in is not "most readable" — a player it
      // never caught has no worst cell, and saying otherwise would invent one.
      if (entry.count < minimumReadableVisits || entry.hits === 0) return best;
      if (!best || entry.hitRate > best.hitRate) return entry;
      return best;
    }, null);

    return Object.freeze({
      entries: Object.freeze(entries),
      hottest,
      coldest,
      mostReadable,
      total,
      spread: hottest.count - coldest.count,
    });
  }

  /*
   * Fisher's exact test on a 2x2 table. Used wherever two rates have to be
   * compared (switch rate after a catch vs after an escape, and so on). Exact
   * rather than a normal approximation, for the same reason binomialTwoSided is
   * exact: these tests decide what the machine claims about a person, and the
   * counts involved are small enough that an approximation would misbehave
   * exactly where players are most likely to be mislabelled.
   */
  function fisherExactTwoSided(a, b, c, d) {
    const counts = [a, b, c, d];
    if (!counts.every((value) => Number.isInteger(value) && value >= 0)) {
      throw new TypeError("2x2 counts must be non-negative integers");
    }
    const rowOne = a + b;
    const rowTwo = c + d;
    const columnOne = a + c;
    const total = rowOne + rowTwo;
    if (total === 0 || rowOne === 0 || rowTwo === 0 || columnOne === 0 || b + d === 0) return 1;

    const logFactorial = [0];
    for (let value = 1; value <= total; value += 1) {
      logFactorial[value] = logFactorial[value - 1] + Math.log(value);
    }
    const constant = logFactorial[rowOne] + logFactorial[rowTwo]
      + logFactorial[columnOne] + logFactorial[b + d] - logFactorial[total];
    const logProbability = (value) => constant - logFactorial[value]
      - logFactorial[rowOne - value] - logFactorial[columnOne - value]
      - logFactorial[rowTwo - columnOne + value];

    const lowest = Math.max(0, columnOne - rowTwo);
    const highest = Math.min(rowOne, columnOne);
    const observed = logProbability(a);
    let sum = 0;
    for (let value = lowest; value <= highest; value += 1) {
      const current = logProbability(value);
      // 1e-7 in log space absorbs float noise so the observed table and its
      // mirror image are never counted inconsistently.
      if (current <= observed + 1e-7) sum += Math.exp(current);
    }
    return clamp(sum, 0, 1);
  }

  function binomialTwoSided(successes, trials, probability = 0.5) {
    if (!Number.isInteger(successes) || !Number.isInteger(trials)) {
      throw new TypeError("successes and trials must be integers");
    }
    if (trials < 0 || successes < 0 || successes > trials) {
      throw new RangeError("invalid binomial counts");
    }
    if (trials === 0) return 1;
    if (probability <= 0 || probability >= 1) {
      return successes === trials * probability ? 1 : 0;
    }

    const probabilities = [];
    let mass = Math.pow(1 - probability, trials);
    probabilities.push(mass);

    for (let value = 1; value <= trials; value += 1) {
      mass *= ((trials - value + 1) / value) * (probability / (1 - probability));
      probabilities.push(mass);
    }

    const observed = probabilities[successes];
    const tolerance = Math.max(1e-15, observed * 1e-12);
    return clamp(
      probabilities.reduce(
        (sum, current) => current <= observed + tolerance ? sum + current : sum,
        0,
      ),
      0,
      1,
    );
  }

  /*
   * `ignoreIndices` drops every window that reads one of the listed hands, not
   * just the hand itself — a window spanning an excluded hand is contaminated by
   * it. Used by classifyPersona to re-measure a habit on the hands where the
   * searchlight was dark.
   */
  function analyseSwitching(choices, options = {}) {
    const minimumOpportunities = Number.isInteger(options.minimumOpportunities)
      ? options.minimumOpportunities
      : 20;
    const minimumEffect = typeof options.minimumEffect === "number"
      ? options.minimumEffect
      : 0.1;
    const alpha = typeof options.alpha === "number" ? options.alpha : 0.05;
    const ignored = options.ignoreIndices instanceof Set
      ? options.ignoreIndices
      : new Set(Array.isArray(options.ignoreIndices) ? options.ignoreIndices : []);
    let opportunities = 0;
    let switches = 0;

    for (let index = 2; index < choices.length; index += 1) {
      const previous = choices[index - 1];
      const beforePrevious = choices[index - 2];
      if (previous !== beforePrevious) continue;
      if (ignored.has(index) || ignored.has(index - 1) || ignored.has(index - 2)) continue;
      opportunities += 1;
      if (choices[index] !== previous) switches += 1;
    }

    const switchRate = opportunities === 0 ? null : switches / opportunities;
    const pValue = opportunities === 0
      ? 1
      : binomialTwoSided(switches, opportunities, 0.5);
    const effect = switchRate === null ? 0 : switchRate - 0.5;
    const significant = pValue < alpha;
    const revealable = opportunities >= minimumOpportunities
      && significant
      && Math.abs(effect) >= minimumEffect;

    return Object.freeze({
      opportunities,
      minimumOpportunities,
      switches,
      stays: opportunities - switches,
      switchRate,
      effect,
      pValue,
      significant,
      revealable,
      direction: effect > 0 ? "switch" : effect < 0 ? "stay" : "balanced",
    });
  }

  /*
   * Which side the player leans toward, corrected for how sticky they are.
   *
   * A plain binomial test on L/R counts is invalid here: a player who tends to
   * stay produces long same-side runs, which violates independence and inflates
   * the apparent deviation. Untreated it labelled 48% of players who had no side
   * preference at all. The lag-1 autocorrelation gives an effective sample size,
   * so a player who made 100 choices but only ~14 independent decisions is
   * tested against 14 — which drops the false positive rate back to ~4%.
   */
  function analyseSideBias(choices, options = {}) {
    const minimumEffective = Number.isInteger(options.minimumEffective) ? options.minimumEffective : 20;
    const minimumEffect = typeof options.minimumEffect === "number" ? options.minimumEffect : 0.08;
    const alpha = typeof options.alpha === "number" ? options.alpha : 0.05;
    const total = choices.length;
    if (total < 4) {
      return Object.freeze({
        total, right: 0, rate: null, autocorrelation: 0, effectiveSamples: 0,
        pValue: 1, revealable: false, direction: "balanced",
      });
    }

    const values = choices.map((choice) => choice === RIGHT ? 1 : 0);
    const right = values.reduce((sum, value) => sum + value, 0);
    const rate = right / total;
    let numerator = 0;
    let denominator = 0;
    for (let index = 0; index < total; index += 1) {
      denominator += (values[index] - rate) ** 2;
      if (index > 0) numerator += (values[index] - rate) * (values[index - 1] - rate);
    }
    const autocorrelation = denominator === 0
      ? 0
      : clamp(numerator / denominator, -0.95, 0.95);
    const effectiveSamples = Math.max(4, Math.round(total * (1 - autocorrelation) / (1 + autocorrelation)));
    const pValue = binomialTwoSided(Math.round(rate * effectiveSamples), effectiveSamples, 0.5);

    return Object.freeze({
      total,
      right,
      rate,
      autocorrelation,
      effectiveSamples,
      pValue,
      revealable: effectiveSamples >= minimumEffective
        && pValue < alpha
        && Math.abs(rate - 0.5) >= minimumEffect,
      direction: rate > 0.5 ? "right" : rate < 0.5 ? "left" : "balanced",
    });
  }

  function compareSwitchRates(records, splitter, options = {}) {
    const minimumEach = Number.isInteger(options.minimumEach) ? options.minimumEach : 10;
    const alpha = typeof options.alpha === "number" ? options.alpha : 0.05;
    let switchedA = 0;
    let stayedA = 0;
    let switchedB = 0;
    let stayedB = 0;

    for (let index = 1; index < records.length; index += 1) {
      const switched = records[index].actual !== records[index - 1].actual;
      const inA = splitter(records[index], records[index - 1]);
      if (inA === null) continue;
      if (inA) {
        if (switched) switchedA += 1; else stayedA += 1;
      } else if (switched) switchedB += 1; else stayedB += 1;
    }

    const totalA = switchedA + stayedA;
    const totalB = switchedB + stayedB;
    const enough = totalA >= minimumEach && totalB >= minimumEach;
    const pValue = enough ? fisherExactTwoSided(switchedA, stayedA, switchedB, stayedB) : 1;
    const rateA = totalA === 0 ? null : switchedA / totalA;
    const rateB = totalB === 0 ? null : switchedB / totalB;

    return Object.freeze({
      switchedA, totalA, rateA,
      switchedB, totalB, rateB,
      pValue,
      measurable: enough,
      revealable: enough && pValue < alpha,
      higher: rateA === null || rateB === null ? null : rateA > rateB ? "a" : rateA < rateB ? "b" : "equal",
    });
  }

  /*
   * Does losing change how the player plays? Group A is the hand after being
   * caught, group B the hand after escaping. This is the trait Shannon's eight
   * cells are indexed by, so it is the one the machine is actually built to see.
   */
  function analyseFeedbackShift(records, options = {}) {
    return compareSwitchRates(records, (_current, previous) => previous.correct === true, options);
  }

  /*
   * Does the player act on the searchlight? Group A is the hands the machine was
   * running on a learned cell, group B the hands it was guessing blind. A player
   * who reads the lamp switches at a different rate under it; one who ignores it
   * plays the same either way. Only meaningful once the lamp exists on screen.
   */
  function analyseLightUse(records, options = {}) {
    return compareSwitchRates(
      records,
      (current) => typeof current.trained === "boolean" ? current.trained : null,
      options,
    );
  }

  function formatPValue(pValue) {
    if (pValue < 0.001) return "p < 0.001";
    return `p = ${pValue.toFixed(pValue < 0.01 ? 4 : 3).replace(/0+$/, "").replace(/\.$/, "")}`;
  }

  /*
   * The end-of-run reveal. It reports the player's own habit and nothing about
   * what the machine stored. Every branch is honest: an undersized sample and a
   * null result each get their own wording rather than being dressed up as a
   * finding.
   */
  function formatTellReport(analysis) {
    if (!analysis || !Number.isInteger(analysis.opportunities)) {
      throw new TypeError("analysis must come from analyseSwitching");
    }

    const floor = Number.isInteger(analysis.minimumOpportunities)
      ? analysis.minimumOpportunities
      : 20;

    if (analysis.opportunities < floor) {
      return Object.freeze({
        revealed: false,
        reason: "sample",
        headline: "样本不够，这一局不下结论。",
        detail: `连续两次走同一边只出现了 ${analysis.opportunities} 次 · 不足以判断习惯`,
      });
    }

    const switchPercent = Math.round(analysis.switchRate * 100);

    if (!analysis.revealable) {
      return Object.freeze({
        revealed: false,
        reason: "null-result",
        headline: "它没能锁定你的固定习惯。",
        detail: `${analysis.opportunities} 次机会里换边 ${switchPercent}% · ${formatPValue(analysis.pValue)} · 这一局没有统计意义上的破绽`,
      });
    }

    const switched = analysis.direction === "switch";
    const percent = switched ? switchPercent : 100 - switchPercent;
    return Object.freeze({
      revealed: true,
      reason: "tell",
      headline: `连续两次走同一边之后，你有 ${percent}% ${switched ? "换到另一边" : "继续留在原边"}。`,
      detail: `${analysis.opportunities} 次机会 · ${formatPValue(analysis.pValue)} · 这就是它抓你的地方`,
    });
  }

  function sessionHash(choices) {
    let hash = 0x811c9dc5;
    for (const choice of choices) {
      hash ^= choice === RIGHT ? 82 : 76;
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, 6);
  }

  function classifyResult(session, previous = null) {
    const choices = session.choices.slice();
    const trials = choices.length;
    const correct = session.correct;
    const accuracy = trials === 0 ? 0 : correct / trials;
    const analysis = analyseSwitching(choices);
    const round = session.round || 1;
    let outcome;
    let subtype = null;

    if (round === 2 && previous) {
      outcome = "revenge";
      const accuracyDelta = accuracy - previous.accuracy;
      const previousRate = previous.analysis.switchRate;
      const currentRate = analysis.switchRate;
      const directionFlipped = previousRate !== null
        && currentRate !== null
        && (previousRate - 0.5) * (currentRate - 0.5) < 0
        && Math.abs(currentRate - previousRate) >= 0.15;

      if (accuracy < 0.5 || accuracyDelta <= -0.03) subtype = "escaped";
      else if (accuracyDelta >= 0.02) subtype = "more-readable";
      else if (directionFlipped) subtype = "new-rule";
      else if (
        analysis.revealable
        && previous.analysis.revealable
        && analysis.direction === previous.analysis.direction
      ) subtype = "same-rule";
      else subtype = "standoff";
    } else if (accuracy < 0.5) {
      outcome = "outsmarted";
    } else if (!analysis.revealable) {
      outcome = "unresolved";
    } else if (accuracy >= 0.62) {
      outcome = "read-through";
    } else {
      outcome = "trace-found";
    }

    return Object.freeze({
      outcome,
      subtype,
      round,
      choices: Object.freeze(choices),
      trials,
      correct,
      accuracy,
      analysis,
      serial: `MR-53-${sessionHash(choices)}`,
      previous,
    });
  }

  /*
   * The behavioural title, kept deliberately separate from the egg.
   *
   * This is entertainment, not a personality instrument, and it is built so that
   * being fun costs nothing in honesty. The trick is what each part claims:
   *
   *   - The name and the numbers DESCRIBE THIS RUN. "You stayed 62% of the time"
   *     is simply what happened across these hands; it needs no test to be true,
   *     so everybody gets a title and a card with real figures on it.
   *   - The seal INFERS SOMETHING ABOUT THE PLAYER. That still requires p < 0.05,
   *     and it is a bonus stamp rather than the gate for getting a name.
   *
   * The earlier version gated the name on significance, which measured correctly
   * but played badly: a casual player with a mild 62% lean is under the
   * resolution of 64 hands, so 72% of them were handed 无名氏 — including two
   * playtesters in a row. The statistics were right and the product was wrong.
   *
   * The egg still says how the run came out; this says how it was played.
   */
  function classifyPersona(records, options = {}) {
    if (!Array.isArray(records)) throw new TypeError("records must be an array");
    const minimumLean = typeof options.minimumLean === "number" ? options.minimumLean : 0.04;
    const choices = records.map((record) => record.actual);
    const habit = analyseSwitching(choices, options.switching);
    const light = analyseLightUse(records, options.light);
    const side = analyseSideBias(choices, options.side);
    const feedback = analyseFeedbackShift(records, options.feedback);

    const axes = [];
    // A p-value is only shown where it means something. On an unsealed row it is
    // the statistic for a claim the machine is not making, and "p = 1" reads to a
    // player as a broken number rather than as honest uncertainty.
    const add = (key, ready, effect, pValue, direction, headline, context) => {
      if (!ready) return;
      const sealed = pValue < 0.05;
      axes.push(Object.freeze({
        key, effect, pValue, direction, headline, sealed,
        detail: sealed ? `${context} · ${formatPValue(pValue)}` : context,
      }));
    };

    if (habit.switchRate !== null && habit.opportunities >= 8) {
      const stays = habit.switchRate < 0.5;
      const percent = Math.round((stays ? 1 - habit.switchRate : habit.switchRate) * 100);
      add(
        "habit", true, Math.abs(habit.switchRate - 0.5), habit.pValue, stays ? "stay" : "switch",
        `连续两次同边之后，你${stays ? "继续留着" : "换边"} ${percent}%`,
        `${habit.opportunities} 次机会`,
      );
    }
    if (light.measurable) {
      add(
        "light", true, Math.abs(light.rateA - light.rateB) / 2, light.pValue,
        light.rateA > light.rateB ? "more" : "less",
        `灯亮时你换边 ${Math.round(light.rateA * 100)}%，灯暗时 ${Math.round(light.rateB * 100)}%`,
        `${light.totalA} 手亮灯 / ${light.totalB} 手灯暗`,
      );
    }
    if (feedback.measurable) {
      add(
        "feedback", true, Math.abs(feedback.rateA - feedback.rateB) / 2, feedback.pValue,
        feedback.rateA > feedback.rateB ? "spooked" : "steady",
        `被抓后你换边 ${Math.round(feedback.rateA * 100)}%，躲开后 ${Math.round(feedback.rateB * 100)}%`,
        `${feedback.totalA} 次被抓 / ${feedback.totalB} 次躲开`,
      );
    }
    if (side.rate !== null && side.effectiveSamples >= 8) {
      const left = side.rate < 0.5;
      add(
        "side", true, Math.abs(side.rate - 0.5), side.pValue, left ? "left" : "right",
        `你走${left ? "左" : "右"}舷 ${Math.round((left ? 1 - side.rate : side.rate) * 100)}%`,
        `折算 ${side.effectiveSamples} 次独立决定`,
      );
    }

    const ranked = axes.slice().sort((first, second) => second.effect - first.effect);
    const strongest = ranked[0] || null;
    const sealed = axes.filter((axis) => axis.sealed).length;

    const NAMES = Object.freeze({
      habit: { stay: "钉子户", switch: "节拍器" },
      light: { more: "掌灯人", less: "掌灯人" },
      feedback: { spooked: "惊弓之鸟", steady: "逆骨" },
      side: { left: "左舵党", right: "右舵党" },
    });

    if (!strongest || strongest.effect < minimumLean) {
      return Object.freeze({
        name: "无名氏",
        base: "无名氏",
        measured: axes.length,
        sealed,
        axes: Object.freeze(ranked),
        unread: true,
        summary: "四项都平得像抛硬币。",
      });
    }

    const base = NAMES[strongest.key][strongest.direction];
    // A second, clearly-present lean becomes a modifier so two players with the
    // same headline trait still read differently.
    const second = ranked.find((axis) => axis !== strongest && axis.effect >= minimumLean * 1.5);
    let prefix = "";
    let suffix = "";
    if (second) {
      if (second.key === "light") prefix = "读灯的";
      else if (second.key === "feedback") prefix = second.direction === "spooked" ? "惊弓的" : "逆骨的";
      else if (second.key === "side") suffix = second.direction === "left" ? " · 左舵" : " · 右舵";
      else if (second.key === "habit") prefix = second.direction === "stay" ? "黏人的" : "跳脱的";
    }
    const duplicated = base === "掌灯人" || base === "惊弓之鸟" || base === "逆骨";

    return Object.freeze({
      name: `${duplicated && (prefix === "读灯的" || prefix.endsWith("的") && base !== "钉子户" && base !== "节拍器") ? "" : prefix}${base}${suffix}`,
      base,
      measured: axes.length,
      sealed,
      axes: Object.freeze(ranked),
      unread: false,
      summary: sealed
        ? `${sealed} 项经机器核验。`
        : "本局的打法记录，机器还不敢下定论。",
    });
  }

  /*
   * Duel titles are intentionally categorical rather than score-like. Every
   * player gets one absurd 100% sticker; a 2:1 result is represented by the
   * tier as a separate hidden achievement, not by a percentage ladder.
   *
   * The ratio is 2:1 rather than 3:1 because the research room runs 64 hands.
   * Half of the machine's guesses are blind coin flips on untrained cells, so
   * even mathematically perfect play lands at a median of 24 machine hits: the
   * old 3:1 line (<= 15) was reachable in 1% of perfect runs, i.e. a lottery.
   * At 2:1 (<= 21) perfect play earns it 25% of the time and chance never does.
   * Keeping it a ratio, not a constant, means it stays calibrated if the hand
   * count changes again.
   */
  function classifyEggScore(playerWins, machineWins) {
    if (!Number.isInteger(playerWins) || !Number.isInteger(machineWins)) {
      throw new TypeError("wins must be integers");
    }
    if (playerWins < 0 || machineWins < 0 || playerWins + machineWins === 0) {
      throw new RangeError("wins must be non-negative and include at least one round");
    }

    if (machineWins >= playerWins * 2) {
      return Object.freeze({
        kind: "bad",
        tier: "shannon-villain",
        percentage: 100,
        label: "100% 大坏蛋",
      });
    }
    if (playerWins >= machineWins * 2) {
      return Object.freeze({
        kind: "smart",
        tier: "shannon-chosen",
        percentage: 100,
        label: "100% 聪明蛋",
      });
    }
    if (playerWins > machineWins) {
      return Object.freeze({
        kind: "smart",
        tier: "smart",
        percentage: 100,
        label: "100% 聪明蛋",
      });
    }
    if (machineWins > playerWins) {
      return Object.freeze({
        kind: "dumb",
        tier: "dumb",
        percentage: 100,
        label: "100% 笨蛋",
      });
    }
    return Object.freeze({
      kind: "ordinary",
      tier: "ordinary",
      percentage: 100,
      label: "100% 普通蛋",
    });
  }

  function normaliseNickname(value) {
    const cleaned = String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim();
    return Array.from(cleaned).slice(0, 12).join("") || "匿名玩家";
  }

  function formatEggGreeting(nickname, eggScore) {
    const name = normaliseNickname(nickname);
    if (!eggScore || typeof eggScore.label !== "string") {
      throw new TypeError("eggScore must be a classified egg score");
    }
    if (eggScore.tier === "shannon-chosen") {
      return `${name}，恭喜你成为香农严选 ${eggScore.label}，你可以用智力发电！`;
    }
    if (eggScore.tier === "shannon-villain") {
      return `${name}，恭喜你成为香农严选 ${eggScore.label}，机器已将你列为重点观察对象，你可以用坏心眼发电！`;
    }
    if (eggScore.kind === "dumb") {
      return `${name}，你是香农严选 ${eggScore.label}，不过傻人有傻福，你可以用运气发电！`;
    }
    if (eggScore.kind === "smart") {
      return `${name}，你是香农严选 ${eggScore.label}，机器还没完全跟上你，你可以用脑洞发电！`;
    }
    return `${name}，你是香农严选 ${eggScore.label}，和机器打成平手，胜在供电稳定！`;
  }

  function classifyTreasure(lives, dangerHits) {
    if (!Number.isInteger(lives)) throw new TypeError("lives must be an integer");
    if (dangerHits !== undefined && (!Number.isInteger(dangerHits) || dangerHits < 0)) {
      throw new RangeError("danger hits must be a non-negative integer");
    }
    const treasures = {
      1: {
        id: "ember-coins",
        archiveNumber: "01",
        name: "余烬金币",
        rarityLevel: 1,
        rarityLabel: "回收级",
      },
      2: {
        id: "relay-compass",
        archiveNumber: "02",
        name: "继电罗盘",
        rarityLevel: 2,
        rarityLabel: "稀有级",
      },
      3: {
        id: "shannon-key",
        archiveNumber: "03",
        name: "香农密钥",
        rarityLevel: 3,
        rarityLabel: "绝密级",
      },
    };
    if (!treasures[lives]) throw new RangeError("treasure requires 1 to 3 remaining lamps");
    if (lives === 3 && dangerHits === 0) {
      return Object.freeze({
        id: "question-manuscript",
        archiveNumber: "04",
        name: "问号原稿",
        rarityLevel: 4,
        rarityLabel: "原典级",
      });
    }
    return Object.freeze(treasures[lives]);
  }

  function formatTreasureGreeting(nickname, treasure) {
    const name = normaliseNickname(nickname);
    if (!treasure || typeof treasure.id !== "string") {
      throw new TypeError("treasure must be a classified treasure");
    }
    if (treasure.id === "ember-coins") {
      return `${name}，只剩最后一盏命灯，你还是把余烬金币带了回来。`;
    }
    if (treasure.id === "relay-compass") {
      return `${name}，机器只熄灭一盏灯，继电罗盘归你。`;
    }
    if (treasure.id === "shannon-key") {
      return `${name}，三盏命灯全部亮着，香农密钥归你。`;
    }
    if (treasure.id === "question-manuscript") {
      return `${name}，一百海里没有一次红光锁定。问号原稿终于现身。`;
    }
    throw new RangeError("unknown treasure id");
  }

  function sanitiseCollectionIds(value) {
    if (!Array.isArray(value)) return [];
    const selected = value.filter((id) => COLLECTION_ITEMS.some((item) => item.id === id));
    const include = (id) => { if (!selected.includes(id)) selected.push(id); };
    if (selected.includes("question-manuscript")) include("shannon-key");
    if (selected.includes("shannon-key")) include("relay-compass");
    if (selected.includes("relay-compass")) include("ember-coins");
    return COLLECTION_ITEMS
      .filter((item) => selected.includes(item.id))
      .map((item) => item.id);
  }

  function qualifyingTreasureIds(lives, dangerHits) {
    if (!Number.isInteger(lives) || lives < 1 || lives > 3) {
      throw new RangeError("treasure qualifications require 1 to 3 remaining lamps");
    }
    if (!Number.isInteger(dangerHits) || dangerHits < 0) {
      throw new RangeError("treasure qualifications require non-negative danger hits");
    }
    const ids = ["ember-coins"];
    if (lives >= 2) ids.push("relay-compass");
    if (lives >= 3) ids.push("shannon-key");
    if (lives === 3 && dangerHits === 0) ids.push("question-manuscript");
    return Object.freeze(ids);
  }

  const COLLECTION_RECORD_DEFAULTS = Object.freeze({
    adventureRuns: 0,
    successfulVoyages: 0,
    furthestMile: 0,
    minDangerHits: null,
    bestLamps: 0,
    perfectVoyages: 0,
    duelRuns: 0,
    duelMinMachineWins: null,
    duelMaxMachineWins: null,
    breakerConfirmations: 0,
    observationConfirmations: 0,
  });

  const COLLECTION_PREFERENCE_DEFAULTS = Object.freeze({
    quickAdventure: false,
    quickDuel: false,
  });

  function boundedInteger(value, min, max, fallback) {
    return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
  }

  function incrementCollectionCount(value) {
    return Math.min(999999, value + 1);
  }

  function nullableBoundedInteger(value, min, max) {
    return value === null ? null : boundedInteger(value, min, max, null);
  }

  function sanitiseCollectionRecords(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      adventureRuns: boundedInteger(input.adventureRuns, 0, 999999, 0),
      successfulVoyages: boundedInteger(input.successfulVoyages, 0, 999999, 0),
      furthestMile: boundedInteger(input.furthestMile, 0, 100, 0),
      minDangerHits: nullableBoundedInteger(input.minDangerHits, 0, 100),
      bestLamps: boundedInteger(input.bestLamps, 0, 3, 0),
      perfectVoyages: boundedInteger(input.perfectVoyages, 0, 999999, 0),
      duelRuns: boundedInteger(input.duelRuns, 0, 999999, 0),
      duelMinMachineWins: nullableBoundedInteger(input.duelMinMachineWins, 0, 64),
      duelMaxMachineWins: nullableBoundedInteger(input.duelMaxMachineWins, 0, 64),
      breakerConfirmations: boundedInteger(input.breakerConfirmations, 0, 999999, 0),
      observationConfirmations: boundedInteger(input.observationConfirmations, 0, 999999, 0),
    };
  }

  function sanitiseCollectionPreferences(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      quickAdventure: input.quickAdventure === true,
      quickDuel: input.quickDuel === true,
    };
  }

  function sanitiseCollectionState(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      version: 2,
      unlocked: sanitiseCollectionIds(input.unlocked),
      records: sanitiseCollectionRecords(input.records),
      preferences: sanitiseCollectionPreferences(input.preferences),
    };
  }

  function responseRecord(level, label, evidence, confirmations) {
    return Object.freeze({
      level,
      label,
      evidence: evidence || "",
      confirmations: Number.isInteger(confirmations) ? confirmations : 0,
    });
  }

  function collectionResponse(item, records, unlocked) {
    if (item.id === "question-manuscript") {
      const best = records.minDangerHits;
      const evidence = best === null ? "" : `本机最少红光 ${best} 次`;
      if (unlocked || best === 0) {
        return responseRecord(4, "原稿已归档", evidence, records.perfectVoyages);
      }
      if (best === null) return responseRecord(0, "尚无完整航迹", "", 0);
      if (best >= 13) return responseRecord(1, "红色干扰仍在", evidence, 0);
      if (best >= 6) return responseRecord(2, "信号正在成形", evidence, 0);
      return responseRecord(3, "原稿轮廓出现", evidence, 0);
    }

    if (item.id === "shannon-breaker") {
      const best = records.duelMinMachineWins;
      const evidence = best === null ? "" : `本机最佳 ${64 - best}:${best}`;
      if (unlocked || (best !== null && best <= 21)) {
        return responseRecord(4, "香农正式签发", evidence, records.breakerConfirmations);
      }
      if (best === null || best >= 32) return responseRecord(0, "封条静默", evidence, 0);
      if (best >= 28) return responseRecord(1, "检测到微弱响应", evidence, 0);
      if (best >= 24) return responseRecord(2, "继电器持续吸合", evidence, 0);
      return responseRecord(3, "封条已经松动", evidence, 0);
    }

    if (item.id === "most-wanted") {
      const best = records.duelMaxMachineWins;
      const evidence = best === null ? "" : `最深观察 ${64 - best}:${best}`;
      if (unlocked || (best !== null && best >= 43)) {
        return responseRecord(4, "机器正式列档", evidence, records.observationConfirmations);
      }
      if (best === null || best <= 32) return responseRecord(0, "封条静默", evidence, 0);
      if (best <= 36) return responseRecord(1, "检测到微弱响应", evidence, 0);
      if (best <= 40) return responseRecord(2, "继电器持续吸合", evidence, 0);
      return responseRecord(3, "封条已经松动", evidence, 0);
    }

    return unlocked
      ? responseRecord(4, "已归档", item.hint, 0)
      : responseRecord(0, "等待回收", item.hint, 0);
  }

  /*
   * The cabinet remembers six authored IDs, anonymous aggregate evidence and
   * the two reveal-speed preferences.
   * The browser supplies a localStorage-shaped adapter; tests and restricted
   * WebViews can supply a tiny in-memory one. Names, individual moves and routes
   * never enter this store.
   */
  function createCollectionStore(storage) {
    let backend = storage && typeof storage.getItem === "function"
      && typeof storage.setItem === "function" && typeof storage.removeItem === "function"
      ? storage
      : null;
    let memory = sanitiseCollectionState(null);

    function read() {
      if (!backend) return sanitiseCollectionState(memory);
      try {
        const raw = backend.getItem(COLLECTION_STORAGE_KEY);
        if (raw) {
          memory = sanitiseCollectionState(JSON.parse(raw));
          return sanitiseCollectionState(memory);
        }
        const legacyRaw = backend.getItem(LEGACY_COLLECTION_STORAGE_KEY);
        memory = legacyRaw
          ? sanitiseCollectionState({ unlocked: JSON.parse(legacyRaw).unlocked })
          : sanitiseCollectionState(null);
      } catch (_error) {
        backend = null;
      }
      return sanitiseCollectionState(memory);
    }

    function write(value) {
      memory = sanitiseCollectionState(value);
      if (backend) {
        try {
          backend.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(memory));
          try {
            backend.removeItem(LEGACY_COLLECTION_STORAGE_KEY);
          } catch (_error) {
            // A successful v2 write is enough; stale v1 data is ignored.
          }
        } catch (_error) {
          backend = null;
        }
      }
      return sanitiseCollectionState(memory);
    }

    function snapshotFromState(value) {
      const state = sanitiseCollectionState(value);
      const unlocked = state.unlocked.slice();
      const records = Object.freeze(Object.assign({}, state.records));
      const preferences = Object.freeze(Object.assign({}, state.preferences));
      const items = COLLECTION_ITEMS.map((item) => Object.freeze(Object.assign({}, item, {
        unlocked: unlocked.includes(item.id),
        response: collectionResponse(item, records, unlocked.includes(item.id)),
      })));
      return Object.freeze({
        count: unlocked.length,
        total: COLLECTION_ITEMS.length,
        complete: unlocked.length === COLLECTION_ITEMS.length,
        unlocked: Object.freeze(unlocked),
        items: Object.freeze(items),
        records,
        preferences,
      });
    }

    function snapshot() {
      return snapshotFromState(read());
    }

    function addUnlocks(state, ids) {
      const newUnlocks = [];
      ids.forEach((id) => {
        if (!COLLECTION_ITEMS.some((candidate) => candidate.id === id)) {
          throw new RangeError("unknown collection item");
        }
        if (!state.unlocked.includes(id)) {
          state.unlocked.push(id);
          newUnlocks.push(id);
        }
      });
      state.unlocked = sanitiseCollectionIds(state.unlocked);
      return newUnlocks;
    }

    function responseChanges(before, after) {
      return after.items.reduce((changes, item) => {
        const previous = before.items.find((candidate) => candidate.id === item.id);
        if (previous && previous.response.level !== item.response.level) {
          changes.push(Object.freeze({
            id: item.id,
            from: previous.response.level,
            to: item.response.level,
            label: item.response.label,
            evidence: item.response.evidence,
          }));
        }
        return changes;
      }, []);
    }

    function archiveUpdate(mode, before, after, newUnlocks, improvements) {
      return Object.freeze({
        mode,
        newUnlocks: Object.freeze(newUnlocks.slice()),
        improvements: Object.freeze(improvements.map((item) => Object.freeze(item))),
        responseChanges: Object.freeze(responseChanges(before, after)),
        completedNow: !before.complete && after.complete,
        snapshot: after,
      });
    }

    function unlockMany(ids) {
      if (!Array.isArray(ids)) throw new TypeError("collection unlocks must be an array");
      ids.forEach((id) => {
        if (!COLLECTION_ITEMS.some((candidate) => candidate.id === id)) {
          throw new RangeError("unknown collection item");
        }
      });
      const before = snapshot();
      const state = read();
      const newUnlocks = addUnlocks(state, sanitiseCollectionIds(ids));
      const after = snapshotFromState(write(state));
      return archiveUpdate("manual", before, after, newUnlocks, []);
    }

    function unlock(id) {
      const item = COLLECTION_ITEMS.find((candidate) => candidate.id === id);
      if (!item) throw new RangeError("unknown collection item");
      const update = unlockMany([id]);
      return Object.freeze({ item, isNew: update.newUnlocks.includes(id), snapshot: update.snapshot });
    }

    function recordAdventure(result) {
      if (!result || typeof result !== "object") throw new TypeError("adventure result is required");
      const distance = boundedInteger(result.distance, 1, 100, null);
      const lives = boundedInteger(result.lives, 0, 3, null);
      const dangerHits = boundedInteger(result.dangerHits, 0, 100, null);
      if (distance === null || lives === null || dangerHits === null) {
        throw new RangeError("invalid adventure result");
      }
      const completed = distance === 100 && lives > 0;
      const before = snapshot();
      const state = read();
      const records = state.records;
      const improvements = [];
      records.adventureRuns = incrementCollectionCount(records.adventureRuns);
      if (distance > records.furthestMile) {
        improvements.push({ key: "furthestMile", previous: records.furthestMile, value: distance });
        records.furthestMile = distance;
      }
      let qualifying = [];
      if (completed) {
        records.successfulVoyages = incrementCollectionCount(records.successfulVoyages);
        if (lives > records.bestLamps) {
          improvements.push({ key: "bestLamps", previous: records.bestLamps, value: lives });
          records.bestLamps = lives;
        }
        if (records.minDangerHits === null || dangerHits < records.minDangerHits) {
          improvements.push({ key: "minDangerHits", previous: records.minDangerHits, value: dangerHits });
          records.minDangerHits = dangerHits;
        }
        if (dangerHits === 0) records.perfectVoyages = incrementCollectionCount(records.perfectVoyages);
        qualifying = qualifyingTreasureIds(lives, dangerHits);
      }
      const newUnlocks = addUnlocks(state, qualifying);
      const after = snapshotFromState(write(state));
      return archiveUpdate("adventure", before, after, newUnlocks, improvements);
    }

    function recordDuel(result) {
      if (!result || typeof result !== "object") throw new TypeError("CASE 8 result is required");
      const playerWins = boundedInteger(result.playerWins, 0, 64, null);
      const machineWins = boundedInteger(result.machineWins, 0, 64, null);
      if (playerWins === null || machineWins === null || playerWins + machineWins !== 64) {
        throw new RangeError("CASE 8 result must contain 64 resolved hands");
      }
      const before = snapshot();
      const state = read();
      const records = state.records;
      const improvements = [];
      records.duelRuns = incrementCollectionCount(records.duelRuns);
      if (records.duelMinMachineWins === null || machineWins < records.duelMinMachineWins) {
        improvements.push({ key: "duelMinMachineWins", previous: records.duelMinMachineWins, value: machineWins });
        records.duelMinMachineWins = machineWins;
      }
      if (records.duelMaxMachineWins === null || machineWins > records.duelMaxMachineWins) {
        improvements.push({ key: "duelMaxMachineWins", previous: records.duelMaxMachineWins, value: machineWins });
        records.duelMaxMachineWins = machineWins;
      }
      const egg = classifyEggScore(playerWins, machineWins);
      const qualifying = [];
      if (egg.tier === "shannon-chosen") {
        qualifying.push("shannon-breaker");
        records.breakerConfirmations = incrementCollectionCount(records.breakerConfirmations);
      }
      if (egg.tier === "shannon-villain") {
        qualifying.push("most-wanted");
        records.observationConfirmations = incrementCollectionCount(records.observationConfirmations);
      }
      const newUnlocks = addUnlocks(state, qualifying);
      const after = snapshotFromState(write(state));
      return archiveUpdate("duel", before, after, newUnlocks, improvements);
    }

    function setQuickMode(mode, enabled) {
      if (mode !== "adventure" && mode !== "duel") throw new RangeError("unknown quick mode");
      if (typeof enabled !== "boolean") throw new TypeError("quick mode must be boolean");
      const state = read();
      state.preferences[mode === "adventure" ? "quickAdventure" : "quickDuel"] = enabled;
      return snapshotFromState(write(state));
    }

    function reset() {
      memory = sanitiseCollectionState(null);
      if (backend) {
        try {
          backend.removeItem(COLLECTION_STORAGE_KEY);
          backend.removeItem(LEGACY_COLLECTION_STORAGE_KEY);
        } catch (_error) {
          backend = null;
        }
      }
      return snapshotFromState(memory);
    }

    return Object.freeze({
      snapshot,
      unlock,
      unlockMany,
      recordAdventure,
      recordDuel,
      setQuickMode,
      reset,
    });
  }

  function formatAdventureLossGreeting(nickname, round) {
    if (!Number.isInteger(round)) throw new TypeError("round must be an integer");
    if (round < 1 || round > 150) throw new RangeError("round must be between 1 and 150");
    const name = normaliseNickname(nickname);
    return `${name}，你在第 ${round} 海里被香农逮住了，宝藏还在前面，不过你可以用不服气发电！`;
  }

  /*
   * Adventure damage is intentionally stricter than a normal correct guess.
   * During warm-up, or while the relevant Shannon cell is untrained, a hit is
   * still a blind 50/50 guess and cannot extend the red tracking chain.
   */
  function advanceAdventureDanger(current, event, options = {}) {
    const warmup = Number.isInteger(options.warmup) ? options.warmup : 10;
    const chainLength = Number.isInteger(options.chainLength) ? options.chainLength : 3;
    if (!current || !Number.isInteger(current.lives) || !Number.isInteger(current.danger)) {
      throw new TypeError("current lives and danger must be integers");
    }
    if (current.lives < 0 || current.danger < 0) {
      throw new RangeError("current lives and danger must be non-negative");
    }
    if (!event || !Number.isInteger(event.round)) {
      throw new TypeError("event round must be an integer");
    }
    if (event.round < 1 || warmup < 0 || chainLength < 1) {
      throw new RangeError("round and rule options are out of range");
    }

    const dangerHit = event.round > warmup
      && event.trained === true
      && event.correct === true;
    let danger = dangerHit ? current.danger + 1 : 0;
    let lives = current.lives;
    let lifeLost = false;
    if (danger >= chainLength && lives > 0) {
      lives -= 1;
      danger = 0;
      lifeLost = true;
    }

    return Object.freeze({
      lives,
      danger,
      dangerHit,
      lifeLost,
      captured: lives === 0,
    });
  }

  return Object.freeze({
    LEFT,
    RIGHT,
    SHANNON_CELL_ORDER,
    COLLECTION_ITEMS,
    COLLECTION_STORAGE_KEY,
    createPredictor,
    createShannonPredictor,
    summariseShannonVisits,
    binomialTwoSided,
    fisherExactTwoSided,
    analyseSwitching,
    analyseSideBias,
    analyseFeedbackShift,
    analyseLightUse,
    formatTellReport,
    classifyPersona,
    classifyResult,
    classifyEggScore,
    classifyTreasure,
    qualifyingTreasureIds,
    normaliseNickname,
    formatEggGreeting,
    formatTreasureGreeting,
    formatAdventureLossGreeting,
    advanceAdventureDanger,
    createCollectionStore,
    sessionHash,
  });
});
