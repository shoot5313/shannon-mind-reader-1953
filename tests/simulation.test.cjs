const test = require("node:test");
const assert = require("node:assert/strict");

const {
  LEFT,
  RIGHT,
  createPredictor,
  createShannonPredictor,
  advanceAdventureDanger,
  analyseSwitching,
  analyseSideBias,
  analyseFeedbackShift,
  analyseLightUse,
  classifyPersona,
  classifyResult,
} = require("../src/engine.js");

// Mirrors the shipped constants in src/two-mode-prototype.js. Retuning either
// side without the other is exactly the drift this file exists to catch.
const VOYAGE = Object.freeze({
  total: 100,
  warmup: 10,
  chain: 3,
  stormAt: 80,
  stormChain: 2,
});

function linearRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function opposite(choice) {
  return choice === LEFT ? RIGHT : LEFT;
}

function simulate(seed, human) {
  const random = linearRandom(seed);
  const predictor = createPredictor({ seed });
  const choices = [];
  let correct = 0;

  for (let index = 0; index < 150; index += 1) {
    const choice = human({ choices, random, index });
    if (predictor.observe(choice).correct) correct += 1;
    choices.push(choice);
  }

  return { choices, correct, accuracy: correct / choices.length };
}

function fairHuman({ random }) {
  return random() < 0.5 ? LEFT : RIGHT;
}

function switchingHuman({ choices, random, index }) {
  if (index < 2) return fairHuman({ random });
  const last = choices[index - 1];
  const repeated = last === choices[index - 2];
  const switchProbability = repeated ? 0.69 : 0.6;
  return random() < switchProbability ? opposite(last) : last;
}

test("fair random input stays near chance and preserves the registered false-positive rate", () => {
  const sessions = Array.from({ length: 500 }, (_, index) => simulate(index + 1, fairHuman));
  const meanAccuracy = sessions.reduce((sum, session) => sum + session.accuracy, 0) / sessions.length;
  const falsePositiveRate = sessions.filter(
    (session) => analyseSwitching(session.choices).revealable,
  ).length / sessions.length;

  assert.ok(meanAccuracy > 0.49 && meanAccuracy < 0.51, `accuracy was ${meanAccuracy}`);
  assert.ok(falsePositiveRate > 0.02 && falsePositiveRate < 0.06, `false positives were ${falsePositiveRate}`);
});

test("a representative switching bias produces useful but non-universal reveals", () => {
  const sessions = Array.from({ length: 500 }, (_, index) => simulate(index + 1, switchingHuman));
  const meanAccuracy = sessions.reduce((sum, session) => sum + session.accuracy, 0) / sessions.length;
  const revealRate = sessions.filter(
    (session) => analyseSwitching(session.choices).revealable,
  ).length / sessions.length;
  const outcomes = new Set(sessions.map((session) => classifyResult({
    choices: session.choices,
    correct: session.correct,
    round: 1,
  }).outcome));

  assert.ok(meanAccuracy > 0.56 && meanAccuracy < 0.61, `accuracy was ${meanAccuracy}`);
  assert.ok(revealRate > 0.7 && revealRate < 0.86, `reveal rate was ${revealRate}`);
  assert.deepEqual(
    outcomes,
    new Set(["outsmarted", "unresolved", "trace-found", "read-through"]),
  );
});

/*
 * `pick` receives whether the searchlight is lit for the hand about to be
 * played — the same `trained` flag the arena renders, and nothing else. It
 * never sees the sealed direction.
 */
function sailVoyage(seed, pick) {
  const random = linearRandom(seed);
  const predictor = createShannonPredictor({ seed });
  let lives = 3;
  let danger = 0;

  for (let round = 1; round <= VOYAGE.total; round += 1) {
    const chainLength = round > VOYAGE.stormAt ? VOYAGE.stormChain : VOYAGE.chain;
    const record = predictor.observe(pick(predictor.predict().trained, random));
    const next = advanceAdventureDanger(
      { lives, danger },
      { round, trained: record.trained, correct: record.correct },
      { warmup: VOYAGE.warmup, chainLength },
    );
    lives = next.lives;
    danger = next.danger;
    if (lives === 0) return 0;
  }

  return lives;
}

function coinFlipper(armed, random) {
  return random() < 0.5 ? LEFT : RIGHT;
}

/*
 * A player with an ordinary human habit — avoid three of a kind — who reads the
 * searchlight and deliberately plays against their own instinct when it is lit.
 */
function makeHabitPlayer(useSearchlight) {
  const history = [];
  return function pick(armed, random) {
    const length = history.length;
    const last = history[length - 1];
    let instinct;
    if (length >= 2 && last === history[length - 2]) {
      instinct = random() < 0.75 ? opposite(last) : last;
    } else {
      instinct = random() < 0.5 ? LEFT : RIGHT;
    }
    const choice = useSearchlight && armed ? opposite(instinct) : instinct;
    history.push(choice);
    return choice;
  };
}

function captureRate(makePick, sessions = 1200) {
  let captured = 0;
  for (let seed = 1; seed <= sessions; seed += 1) {
    if (sailVoyage(seed, makePick()) === 0) captured += 1;
  }
  return captured / sessions;
}

/*
 * The voyage was shortened from 150 hands to 100 and the warm-up from 30 to 10.
 * Length alone would have made it far easier — a coin-flipping player survived
 * 90% of runs and 40% finished with all three lamps, which would have handed the
 * rarest treasure to the least engaged player. The storm rule at hand 80 pays
 * that back. These bands exist so the next length change cannot silently undo it.
 */
test("a coin-flipping voyage stays winnable without making the rarest treasure common", () => {
  const lamps = [0, 0, 0, 0];
  const sessions = 2000;
  for (let seed = 1; seed <= sessions; seed += 1) lamps[sailVoyage(seed, coinFlipper)] += 1;

  const capturedRate = lamps[0] / sessions;
  const perfectRate = lamps[3] / sessions;

  assert.ok(
    capturedRate > 0.2 && capturedRate < 0.35,
    `random players were captured ${(capturedRate * 100).toFixed(1)}% of the time`,
  );
  assert.ok(
    perfectRate > 0.14 && perfectRate < 0.25,
    `the three-lamp treasure landed ${(perfectRate * 100).toFixed(1)}% of the time`,
  );
  assert.ok(
    lamps[2] > lamps[3],
    "two lamps must stay more common than three, or the rarity ladder inverts",
  );
});

/*
 * The property the searchlight exists to create.
 *
 * Before it, the voyage gave the player no information on any hand, so the best
 * available strategy was to suppress themselves and flip a coin: a human habit
 * lost roughly twice as often as pure chance. That makes engagement the losing
 * move, which is the opposite of what a game should reward. The searchlight
 * reports whether the machine is acting on a learned cell — strength, never
 * direction — so a player with a habit can pick the hands worth breaking it on.
 *
 * If this ever fails, the loop has gone back to punishing attention.
 */
test("reading the searchlight beats flipping a coin, and ignoring it loses to one", () => {
  const chance = captureRate(() => coinFlipper);
  const habitBlind = captureRate(() => makeHabitPlayer(false));
  const habitReading = captureRate(() => makeHabitPlayer(true));

  const pct = (value) => `${(value * 100).toFixed(1)}%`;

  assert.ok(
    habitBlind > chance + 0.1,
    `an unexamined habit must be clearly worse than chance: habit ${pct(habitBlind)} vs chance ${pct(chance)}`,
  );
  assert.ok(
    habitReading < chance,
    `reading the light must beat flipping a coin: reading ${pct(habitReading)} vs chance ${pct(chance)}`,
  );
  assert.ok(
    habitBlind - habitReading > 0.15,
    `the light must be worth a large, felt swing: ${pct(habitBlind)} -> ${pct(habitReading)}`,
  );
  // It informs play without solving it: mastery still has somewhere to go.
  assert.ok(
    habitReading > 0.08,
    `the light must not trivialise the voyage: reading ${pct(habitReading)}`,
  );
});


/*
 * The persona is a claim about a person, so every axis must stay honest on
 * someone who has no pattern at all. Each test is nominally 5%; the bands allow
 * for sampling noise at 1500 runs.
 *
 * The side-bias axis is the one that needs watching. A plain binomial on L/R
 * counts labelled 48% of pattern-free-but-sticky players as left- or
 * right-handed, because long same-side runs break the independence the test
 * assumes. analyseSideBias corrects by effective sample size; if that correction
 * is ever weakened, the sticky case below is what will catch it.
 */
test("a player with no pattern is not given a personality", () => {
  const sessions = 1500;
  const fired = { habit: 0, side: 0, light: 0, feedback: 0, named: 0 };
  const stickyFired = { side: 0 };

  for (let seed = 1; seed <= sessions; seed += 1) {
    const random = linearRandom(seed * 7919);
    const predictor = createShannonPredictor({ seed });
    const records = [];
    for (let round = 0; round < 100; round += 1) {
      predictor.predict();
      records.push(predictor.observe(random() < 0.5 ? LEFT : RIGHT));
    }
    const choices = records.map((record) => record.actual);
    if (analyseSwitching(choices).revealable) fired.habit += 1;
    if (analyseSideBias(choices).revealable) fired.side += 1;
    if (analyseLightUse(records).revealable) fired.light += 1;
    if (analyseFeedbackShift(records).revealable) fired.feedback += 1;
    if (!classifyPersona(records).unread) fired.named += 1;

    // Same absence of side preference, but played stickily.
    const stickyRandom = linearRandom(seed * 104729);
    const sticky = createShannonPredictor({ seed });
    const stickyChoices = [];
    let current = stickyRandom() < 0.5 ? LEFT : RIGHT;
    for (let round = 0; round < 100; round += 1) {
      if (stickyRandom() >= 0.8) current = opposite(current);
      sticky.observe(current);
      stickyChoices.push(current);
    }
    if (analyseSideBias(stickyChoices).revealable) stickyFired.side += 1;
  }

  const rate = (count) => count / sessions;
  const pct = (count) => `${(rate(count) * 100).toFixed(1)}%`;

  ["habit", "side", "light", "feedback"].forEach((axis) => {
    assert.ok(
      rate(fired[axis]) < 0.09,
      `${axis} fired on ${pct(fired[axis])} of pattern-free players (nominal 5%)`,
    );
  });
  assert.ok(
    rate(stickyFired.side) < 0.09,
    `side bias fired on ${pct(stickyFired.side)} of sticky players with no side preference`,
  );
  // Four independent 5% tests, so roughly one run in five earns some name.
  assert.ok(
    rate(fired.named) < 0.3,
    `${pct(fired.named)} of pattern-free players were given a persona`,
  );
});
