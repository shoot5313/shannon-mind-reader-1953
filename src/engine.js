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
   * The egg says how well the run went; this says how the player played. They
   * are not independent — an unexamined habit usually costs games — but they are
   * not redundant either, because the searchlight lets a player keep their habit
   * and still win. Measured: a stayer who ignores the lamp is a 大坏蛋 85% of the
   * time, while the same stayer reading the lamp is a 聪明蛋 94% of the time.
   * Same title, opposite egg.
   *
   * Every component has to be earned by a test that can fail. A player the
   * machine could not read gets 无名氏, which is the honest answer and, at ~92%
   * of genuinely random players, the rarest one for anybody actually trying.
   */
  function classifyPersona(records, options = {}) {
    if (!Array.isArray(records)) throw new TypeError("records must be an array");
    const choices = records.map((record) => record.actual);
    let habit = analyseSwitching(choices, options.switching);
    /*
     * A player who acts on the searchlight inverts their instinct on lit hands,
     * which scrambles the raw stay/switch pattern: measured, only 35% of
     * lamp-reading stayers were detectable this way, and they collapsed into the
     * generic 掌灯人. Re-measuring on the hands where the lamp was dark recovers
     * the underlying habit for 87% of them. It is a second look at the same data,
     * so alpha is tightened to 0.02 — which keeps the added false-positive cost
     * on a truly random player at 0.1 percentage points.
     */
    if (!habit.revealable) {
      const litHands = [];
      records.forEach((record, index) => {
        if (record.trained === true) litHands.push(index);
      });
      if (litHands.length) {
        const blind = analyseSwitching(choices, Object.assign({
          minimumOpportunities: 15,
          alpha: 0.02,
        }, options.switching, { ignoreIndices: litHands }));
        if (blind.revealable) habit = blind;
      }
    }
    const light = analyseLightUse(records, options.light);
    const side = analyseSideBias(choices, options.side);
    const feedback = analyseFeedbackShift(records, options.feedback);

    const axes = [];
    // Every axis is reported, lit or not. Showing the four that were tried makes
    // the card comparable between two people — same rows, different ones lit —
    // and stops a single finding from looking like the whole story.
    const PENDING = Object.freeze({
      habit: "留还是换",
      light: "灯亮时的打法",
      feedback: "输赢的影响",
      side: "左右偏好",
    });
    const add = (key, headline, detail) => axes.push(Object.freeze({ key, headline, detail }));

    if (habit.revealable) {
      const stays = habit.direction === "stay";
      const percent = Math.round((stays ? 1 - habit.switchRate : habit.switchRate) * 100);
      add(
        "habit",
        stays ? "连续两次同边之后，你倾向继续留着" : "连续两次同边之后，你倾向换边",
        `${percent}% · ${habit.opportunities} 次检验 · ${formatPValue(habit.pValue)}`,
      );
    }
    if (light.revealable) {
      add(
        "light",
        "灯亮的时候，你会换一种打法",
        `亮灯换边 ${Math.round(light.rateA * 100)}% · 灯暗 ${Math.round(light.rateB * 100)}% · ${formatPValue(light.pValue)}`,
      );
    }
    if (feedback.revealable) {
      add(
        "feedback",
        feedback.higher === "a" ? "被抓之后，你更容易改主意" : "被抓之后，你反而更沉得住气",
        `被抓后换边 ${Math.round(feedback.rateA * 100)}% · 躲开后 ${Math.round(feedback.rateB * 100)}% · ${formatPValue(feedback.pValue)}`,
      );
    }
    if (side.revealable) {
      add(
        "side",
        side.direction === "left" ? "你偏爱左舷" : "你偏爱右舷",
        `${Math.round((side.direction === "left" ? 1 - side.rate : side.rate) * 100)}% · 折算 ${side.effectiveSamples} 次独立决定 · ${formatPValue(side.pValue)}`,
      );
    }

    const prefix = light.revealable
      ? "读灯的"
      : feedback.revealable
        ? (feedback.higher === "a" ? "惊弓的" : "逆骨的")
        : "";
    const suffix = side.revealable ? (side.direction === "left" ? " · 左舵" : " · 右舵") : "";

    const unmeasured = Object.freeze(Object.keys(PENDING)
      .filter((key) => !axes.some((axis) => axis.key === key))
      .map((key) => Object.freeze({ key, label: PENDING[key] })));

    let base;
    if (habit.revealable) base = habit.direction === "stay" ? "钉子户" : "节拍器";
    else if (light.revealable) base = "掌灯人";
    else if (feedback.revealable) base = feedback.higher === "a" ? "惊弓之鸟" : "逆骨";
    else if (side.revealable) base = side.direction === "left" ? "左舵党" : "右舵党";
    else return Object.freeze({
      name: "无名氏",
      base: "无名氏",
      measured: 0,
      axes: Object.freeze([]),
      unmeasured,
      unread: true,
      summary: "四项检验都没能锁定你的规律。",
    });

    // The prefix already carries the light or feedback axis; do not repeat it in
    // the base, or a reader becomes a "读灯的掌灯人".
    const name = `${base === "掌灯人" || base === "惊弓之鸟" || base === "逆骨" ? "" : prefix}${base}${suffix}`;

    return Object.freeze({
      name,
      base,
      measured: axes.length,
      axes: Object.freeze(axes),
      unmeasured,
      unread: false,
      summary: `${axes.length} 项检验读到了你。`,
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

  function classifyTreasure(lives) {
    if (!Number.isInteger(lives)) throw new TypeError("lives must be an integer");
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
    throw new RangeError("unknown treasure id");
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
    normaliseNickname,
    formatEggGreeting,
    formatTreasureGreeting,
    formatAdventureLossGreeting,
    advanceAdventureDanger,
    sessionHash,
  });
});
