const test = require("node:test");
const assert = require("node:assert/strict");

const {
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
  classifyPersona,
  formatTellReport,
  classifyResult,
  classifyEggScore,
  classifyTreasure,
  normaliseNickname,
  formatEggGreeting,
  formatTreasureGreeting,
  formatAdventureLossGreeting,
  advanceAdventureDanger, COLLECTION_ITEMS, COLLECTION_STORAGE_KEY, createCollectionStore, qualifyingTreasureIds,
} = require("../src/engine.js");

function opposite(choice) {
  return choice === LEFT ? RIGHT : LEFT;
}

function runSequence(choices, seed = 1953) {
  const predictor = createPredictor({ seed });
  const records = choices.map((choice) => predictor.observe(choice));
  return {
    choices,
    records,
    correct: records.filter((record) => record.correct).length,
  };
}

test("a prediction is committed before the choice is observed", () => {
  const predictor = createPredictor({ seed: 7 });
  const first = predictor.predict();
  const repeated = predictor.predict();

  assert.strictEqual(first, repeated);
  const record = predictor.observe(first.choice === LEFT ? RIGHT : LEFT);
  assert.equal(record.predicted, first.choice);
  assert.equal(record.correct, false);
  assert.equal(predictor.snapshot().history.length, 1);
});

test("the exact binomial test is symmetric and calibrated at the center", () => {
  assert.equal(binomialTwoSided(5, 10), 1);
  assert.ok(Math.abs(binomialTwoSided(0, 10) - binomialTwoSided(10, 10)) < 1e-12);
  assert.ok(binomialTwoSided(0, 10) < 0.01);
});

test("the registered switching test detects an LLRR pattern", () => {
  const choices = Array.from({ length: 48 }, (_, index) => (
    [LEFT, LEFT, RIGHT, RIGHT][index % 4]
  ));
  const analysis = analyseSwitching(choices);

  assert.equal(analysis.switchRate, 1);
  assert.equal(analysis.direction, "switch");
  assert.equal(analysis.revealable, true);
  assert.ok(analysis.pValue < 0.001);
});

test("Fisher's exact test matches published values", () => {
  // Fisher's own tea-tasting table.
  assert.ok(Math.abs(fisherExactTwoSided(3, 1, 1, 3) - 0.4857) < 0.0005);
  assert.ok(Math.abs(fisherExactTwoSided(4, 0, 0, 4) - 0.02857) < 0.0005);
  assert.equal(fisherExactTwoSided(5, 5, 5, 5), 1);
  // Degenerate tables carry no evidence and must not claim any.
  assert.equal(fisherExactTwoSided(0, 0, 3, 3), 1);
  assert.ok(fisherExactTwoSided(40, 10, 20, 30) < 0.001);
});

test("side bias is corrected for stickiness, or a stayer is called left-handed", () => {
  // A player who alternates has negative autocorrelation and plenty of
  // independent information: an even split is correctly read as no preference.
  const alternating = Array.from({ length: 100 }, (_, index) => index % 2 ? LEFT : RIGHT);
  const even = analyseSideBias(alternating);
  assert.equal(even.revealable, false);
  assert.ok(even.effectiveSamples > alternating.length);

  // Long runs are the trap. Ten blocks of ten is a 50/50 split, but a naive
  // binomial on 100 hands would treat it as 100 independent decisions.
  const sticky = [];
  for (let block = 0; block < 10; block += 1) {
    for (let index = 0; index < 10; index += 1) sticky.push(block % 2 ? LEFT : RIGHT);
  }
  const stickyBias = analyseSideBias(sticky);
  assert.ok(stickyBias.autocorrelation > 0.7, "long runs must show high autocorrelation");
  assert.ok(
    stickyBias.effectiveSamples < 30,
    `100 sticky hands are not 100 decisions: got ${stickyBias.effectiveSamples}`,
  );
  assert.equal(stickyBias.revealable, false);

  // A genuine lean, played independently, is still found.
  const leaning = Array.from({ length: 120 }, (_, index) => index % 10 < 7 ? RIGHT : LEFT);
  const leaningBias = analyseSideBias(leaning);
  assert.equal(leaningBias.direction, "right");
  assert.ok(leaningBias.rate > 0.65);
});

test("the feedback and searchlight axes compare two conditional switch rates", () => {
  // Switches after a catch, stays after an escape: the classic spooked player.
  const spooked = [];
  for (let index = 0; index < 60; index += 1) {
    const caught = index % 2 === 0;
    const previous = spooked.length ? spooked[spooked.length - 1] : LEFT;
    const wasCaught = spooked.length ? spooked[spooked.length - 1].correct : false;
    spooked.push({
      actual: wasCaught ? opposite(previous.actual || LEFT) : (previous.actual || LEFT),
      correct: caught,
      trained: index % 3 === 0,
    });
  }
  const shift = analyseFeedbackShift(spooked);
  assert.equal(shift.measurable, true);
  assert.equal(shift.higher, "a", "a spooked player switches more after being caught");
  assert.ok(shift.revealable);

  // Too few of either condition means no claim, not a claim from three samples.
  const lopsided = Array.from({ length: 40 }, (_, index) => ({
    actual: index % 2 ? LEFT : RIGHT,
    correct: true,
    trained: true,
  }));
  assert.equal(analyseFeedbackShift(lopsided).measurable, false);
  assert.equal(analyseFeedbackShift(lopsided).revealable, false);
  assert.equal(analyseLightUse(lopsided).measurable, false);

  // Records without a trained flag cannot be split by lamp state at all.
  const noLamp = lopsided.map(({ actual, correct }) => ({ actual, correct }));
  assert.equal(analyseLightUse(noLamp).measurable, false);
});

/*
 * The persona is entertainment, and it is built so that being fun costs nothing
 * in honesty: the name and the numbers describe the run that was played, which
 * needs no test to be true, while the seal infers something about the player and
 * still requires p < 0.05.
 */
test("the persona describes the run for everyone and seals only what is significant", () => {
  // A committed stayer: named, and the lean is strong enough to be sealed.
  const stayer = Array.from({ length: 90 }, (_, index) => ({
    actual: index % 10 < 8 ? LEFT : RIGHT,
    correct: index % 4 === 0,
    trained: index % 3 === 0,
  }));
  const nail = classifyPersona(stayer);
  assert.equal(nail.unread, false);
  assert.ok(nail.name.length > 0);
  assert.ok(nail.sealed >= 1, "a strong, consistent lean should earn a seal");

  // Every axis on show reports the run in figures and carries its own p-value,
  // sealed or not — there is no "we found nothing" row any more.
  assert.ok(nail.axes.length >= 1);
  nail.axes.forEach((axis) => {
    assert.match(axis.headline, /\d+%/, `axis ${axis.key} must quote the run's own figure`);
    assert.equal(typeof axis.sealed, "boolean");
    // A p-value appears exactly where a claim is being made.
    if (axis.sealed) assert.match(axis.detail, /p (<|=)/);
    else assert.doesNotMatch(axis.detail, /p (<|=)/);
    assert.ok(axis.effect >= 0);
  });
  // Axes are ordered by how pronounced they were, so the name matches the top row.
  const effects = nail.axes.map((axis) => axis.effect);
  assert.deepEqual(effects, effects.slice().sort((a, b) => b - a));

  // A seal is never claimed without significance, and never withheld with it.
  nail.axes.forEach((axis) => {
    assert.equal(axis.sealed, axis.pValue < 0.05, `axis ${axis.key} seal disagrees with its p-value`);
  });

  // Perfectly flat play is the one case with nothing to describe.
  const flat = Array.from({ length: 40 }, (_, index) => ({
    actual: index % 2 ? LEFT : RIGHT,
    correct: index % 2 === 0,
    trained: index % 2 === 0,
  }));
  const flatPersona = classifyPersona(flat, { minimumLean: 0.49 });
  assert.equal(flatPersona.unread, true);
  assert.equal(flatPersona.name, "无名氏");

  // The persona must never mention the egg, and vice versa: one describes how
  // the run was played, the other how it came out.
  assert.doesNotMatch(nail.name, /蛋/);
  assert.doesNotMatch(nail.axes.map((axis) => axis.headline).join(""), /蛋/);
});

test("the tell report separates a real habit, a null result, and too small a sample", () => {
  const patterned = formatTellReport(analyseSwitching(
    Array.from({ length: 48 }, (_, index) => [LEFT, LEFT, RIGHT, RIGHT][index % 4]),
  ));
  assert.equal(patterned.revealed, true);
  assert.equal(patterned.reason, "tell");
  assert.equal(patterned.headline, "连续两次走同一边之后，你有 100% 换到另一边。");
  assert.match(patterned.detail, /^23 次机会 · p < 0\.001 · 这就是它抓你的地方$/);

  // A player who always stays is just as readable, and must be told so in the
  // opposite direction rather than as a low switch rate.
  const stayer = formatTellReport(analyseSwitching(Array(60).fill(LEFT)));
  assert.equal(stayer.revealed, true);
  assert.equal(stayer.headline, "连续两次走同一边之后，你有 100% 继续留在原边。");

  // Runs of three leave every repeated pair followed once by a stay and once by
  // a switch, so the habit test lands exactly on chance.
  const evenAnalysis = analyseSwitching(
    Array.from({ length: 120 }, (_, index) => [LEFT, LEFT, LEFT, RIGHT, RIGHT, RIGHT][index % 6]),
  );
  assert.ok(Math.abs(evenAnalysis.switchRate - 0.5) < 0.01);
  assert.ok(evenAnalysis.opportunities >= evenAnalysis.minimumOpportunities);
  const balanced = formatTellReport(evenAnalysis);
  assert.equal(balanced.revealed, false);
  assert.equal(balanced.reason, "null-result");
  assert.equal(balanced.headline, "它没能锁定你的固定习惯。");
  assert.match(balanced.detail, /换边 49% · p = 1 · 这一局没有统计意义上的破绽$/);

  const thin = formatTellReport(analyseSwitching([LEFT, LEFT, RIGHT, RIGHT, LEFT]));
  assert.equal(thin.revealed, false);
  assert.equal(thin.reason, "sample");
  assert.equal(thin.headline, "样本不够，这一局不下结论。");

  // Every branch has to fit on a 1080px share card.
  [patterned, stayer, balanced, thin].forEach((report) => {
    assert.ok(Array.from(report.headline).length <= 30, report.headline);
    assert.ok(Array.from(report.detail).length <= 42, report.detail);
  });
});

test("the predictor learns a fixed four-step pattern online", () => {
  const choices = Array.from({ length: 150 }, (_, index) => (
    [LEFT, LEFT, RIGHT, RIGHT][index % 4]
  ));
  const session = runSequence(choices);

  assert.ok(session.correct / choices.length > 0.85);
});

test("the Shannon predictor seals a move and only trusts repeated cell behavior", () => {
  const predictor = createShannonPredictor({ seed: 1953 });
  let trainedPredictions = 0;
  for (let index = 0; index < 150; index += 1) {
    const pending = predictor.predict();
    assert.strictEqual(pending, predictor.predict());
    if (pending.trained) trainedPredictions += 1;
    const observed = predictor.observe(LEFT);
    assert.equal(observed.predicted, pending.choice);
  }

  assert.ok(trainedPredictions > 80, `only ${trainedPredictions} trained predictions`);
  assert.ok(predictor.snapshot().cells.length <= 8);
});

test("the Shannon visit profile counts all eight cells without inventing the first two states", () => {
  const records = [
    { state: null },
    { state: null },
    { state: "LDL" },
    { state: "LDL" },
    { state: "WDL" },
    { state: "WSL" },
    { state: "UNKNOWN" },
  ];
  const profile = summariseShannonVisits(records);
  const counts = new Map(profile.entries.map((entry) => [entry.state, entry.count]));

  assert.deepEqual(profile.entries.map((entry) => entry.state), SHANNON_CELL_ORDER);
  assert.equal(profile.total, 4);
  assert.equal(counts.get("LDL"), 2);
  assert.equal(counts.get("WDL"), 1);
  assert.equal(counts.get("WSL"), 1);
  assert.equal(profile.hottest.state, "LDL");
  assert.equal(profile.hottest.count, 2);
  assert.equal(profile.coldest.count, 0);
  assert.equal(profile.spread, 2);
});

test("the visit profile reports how readable the player was, never what a cell stored", () => {
  const records = [
    { state: null, correct: true },
    { state: null, correct: false },
    ...Array.from({ length: 5 }, (_, index) => ({ state: "LDL", correct: index < 4 })),
    ...Array.from({ length: 6 }, (_, index) => ({ state: "WSW", correct: index < 2 })),
    { state: "WDL", correct: true },
  ];
  const profile = summariseShannonVisits(records);
  const cells = new Map(profile.entries.map((entry) => [entry.state, entry]));

  assert.deepEqual(cells.get("LDL"), { state: "LDL", count: 5, hits: 4, hitRate: 0.8 });
  assert.deepEqual(cells.get("WSW"), { state: "WSW", count: 6, hits: 2, hitRate: 1 / 3 });
  assert.equal(cells.get("WSL").hitRate, null, "an unvisited cell has no rate, not a zero");

  // WDL was caught 1/1 but is below the visit floor, so the honest answer is the
  // cell with a rate worth reporting.
  assert.equal(profile.mostReadable.state, "LDL");
  assert.equal(profile.mostReadable.hits, 4);

  // Nothing in the profile can leak the remembered reaction.
  assert.ok(profile.entries.every((entry) => !("reaction" in entry) && !("repeated" in entry)));

  assert.equal(
    summariseShannonVisits([{ state: "LDL", correct: true }]).mostReadable,
    null,
    "a thin sample must not crown a most-readable cell",
  );

  assert.equal(
    summariseShannonVisits(
      Array.from({ length: 30 }, () => ({ state: "LDL", correct: false })),
    ).mostReadable,
    null,
    "a player the machine never caught has no worst cell to name",
  );
});

test("tracking all eight Shannon cells approaches the published 3:1 counter-strategy", () => {
  const predictor = createShannonPredictor({ seed: 1953 });
  const choices = [];
  let machineWins = 0;

  for (let index = 0; index < 6000; index += 1) {
    const pending = predictor.predict();
    const previous = choices.at(-1);
    let choice;
    if (!previous || pending.state === null) choice = index % 2 ? RIGHT : LEFT;
    else {
      const cell = pending.cell;
      const reaction = !cell || cell.reaction === null
        ? "S"
        : cell.repeated
          ? (cell.reaction === "S" ? "D" : "S")
          : cell.reaction;
      choice = reaction === "S" ? previous : opposite(previous);
    }
    if (predictor.observe(choice).correct) machineWins += 1;
    choices.push(choice);
  }

  const machineAccuracy = machineWins / choices.length;
  assert.ok(machineAccuracy > 0.24 && machineAccuracy < 0.27, `accuracy was ${machineAccuracy}`);
});

test("first-round outcomes are mutually exclusive", () => {
  const patternedChoices = Array.from({ length: 150 }, (_, index) => (
    [LEFT, LEFT, RIGHT, RIGHT][index % 4]
  ));
  const patterned = classifyResult({
    ...runSequence(patternedChoices),
    round: 1,
  });
  const outsmarted = classifyResult({
    choices: Array(150).fill(LEFT),
    correct: 60,
    round: 1,
  });

  assert.equal(patterned.outcome, "read-through");
  assert.equal(outsmarted.outcome, "outsmarted");
});

test("a second round always receives the revenge report family", () => {
  const first = classifyResult({
    ...runSequence(Array.from({ length: 150 }, (_, index) => index % 2 ? LEFT : RIGHT)),
    round: 1,
  });
  const second = classifyResult({
    ...runSequence(Array.from({ length: 150 }, (_, index) => (
      [LEFT, LEFT, RIGHT, RIGHT][index % 4]
    ))),
    round: 2,
  }, first);

  assert.equal(second.outcome, "revenge");
  assert.ok(["escaped", "more-readable", "new-rule", "same-rule", "standoff"].includes(second.subtype));
});

test("egg titles are categorical while 2:1 remains a symmetric hidden achievement", () => {
  const smart = { kind: "smart", tier: "smart", percentage: 100, label: "100% 聪明蛋" };
  const dumb = { kind: "dumb", tier: "dumb", percentage: 100, label: "100% 笨蛋" };
  const chosen = { kind: "smart", tier: "shannon-chosen", percentage: 100, label: "100% 聪明蛋" };
  const villain = { kind: "bad", tier: "shannon-villain", percentage: 100, label: "100% 大坏蛋" };

  assert.deepEqual(classifyEggScore(33, 31), smart);
  assert.deepEqual(classifyEggScore(31, 33), dumb);
  assert.deepEqual(classifyEggScore(32, 32), {
    kind: "ordinary", tier: "ordinary", percentage: 100, label: "100% 普通蛋",
  });

  // The 64-hand boundary the research room actually plays on.
  assert.deepEqual(classifyEggScore(43, 21), chosen);
  assert.deepEqual(classifyEggScore(42, 22), smart);
  assert.deepEqual(classifyEggScore(21, 43), villain);
  assert.deepEqual(classifyEggScore(22, 42), dumb);

  // A clean sweep from either end still resolves, and stays exclusive.
  assert.deepEqual(classifyEggScore(64, 0), chosen);
  assert.deepEqual(classifyEggScore(0, 64), villain);

  // The rule is a ratio, so it holds at any hand count.
  assert.deepEqual(classifyEggScore(2, 1), chosen);
  assert.deepEqual(classifyEggScore(1, 2), villain);
  assert.deepEqual(classifyEggScore(38, 26), smart);
  assert.deepEqual(classifyEggScore(26, 38), dumb);
});

test("nickname result copy is deterministic, short, and social-card ready", () => {
  assert.equal(normaliseNickname("  L\n"), "L");
  assert.equal(normaliseNickname("一二三四五六七八九十十一十二十三"), "一二三四五六七八九十十一");
  assert.equal(normaliseNickname("\u0000  "), "匿名玩家");

  assert.equal(
    formatEggGreeting("L", classifyEggScore(49, 15)),
    "L，恭喜你成为香农严选 100% 聪明蛋，你可以用智力发电！",
  );
  assert.equal(
    formatEggGreeting("R", classifyEggScore(31, 33)),
    "R，你是香农严选 100% 笨蛋，不过傻人有傻福，你可以用运气发电！",
  );
  assert.equal(
    formatEggGreeting("S", classifyEggScore(38, 26)),
    "S，你是香农严选 100% 聪明蛋，机器还没完全跟上你，你可以用脑洞发电！",
  );
  assert.equal(
    formatEggGreeting("P", classifyEggScore(32, 32)),
    "P，你是香农严选 100% 普通蛋，和机器打成平手，胜在供电稳定！",
  );
  assert.equal(
    formatEggGreeting("B", classifyEggScore(15, 49)),
    "B，恭喜你成为香农严选 100% 大坏蛋，机器已将你列为重点观察对象，你可以用坏心眼发电！",
  );
  assert.equal(formatTreasureGreeting("Y", classifyTreasure(1)), "Y，只剩最后一盏命灯，你还是把余烬金币带了回来。");
  assert.equal(formatTreasureGreeting("Y", classifyTreasure(2)), "Y，机器只熄灭一盏灯，继电罗盘归你。");
  assert.equal(formatTreasureGreeting("Y", classifyTreasure(3)), "Y，三盏命灯全部亮着，香农密钥归你。");
  assert.equal(
    formatTreasureGreeting("Y", classifyTreasure(3, 0)),
    "Y，一百海里没有一次红光锁定。问号原稿终于现身。",
  );
  assert.equal(
    formatAdventureLossGreeting("Y", 39),
    "Y，你在第 39 海里被香农逮住了，宝藏还在前面，不过你可以用不服气发电！",
  );
});

test("remaining lamps select three treasures while zero red locks reveals the fourth", () => {
  assert.deepEqual(classifyTreasure(1), {
    id: "ember-coins", archiveNumber: "01", name: "余烬金币", rarityLevel: 1, rarityLabel: "回收级",
  });
  assert.deepEqual(classifyTreasure(2), {
    id: "relay-compass", archiveNumber: "02", name: "继电罗盘", rarityLevel: 2, rarityLabel: "稀有级",
  });
  assert.deepEqual(classifyTreasure(3), {
    id: "shannon-key", archiveNumber: "03", name: "香农密钥", rarityLevel: 3, rarityLabel: "绝密级",
  });
  assert.deepEqual(classifyTreasure(3, 1), {
    id: "shannon-key", archiveNumber: "03", name: "香农密钥", rarityLevel: 3, rarityLabel: "绝密级",
  });
  assert.deepEqual(classifyTreasure(3, 0), {
    id: "question-manuscript", archiveNumber: "04", name: "问号原稿", rarityLevel: 4, rarityLabel: "原典级",
  });
  assert.throws(() => classifyTreasure(0), /1 to 3/);
  assert.throws(() => classifyTreasure(3, -1), /non-negative integer/);
  assert.deepEqual(qualifyingTreasureIds(1, 9), ["ember-coins"]);
  assert.deepEqual(qualifyingTreasureIds(2, 6), ["ember-coins", "relay-compass"]);
  assert.deepEqual(qualifyingTreasureIds(3, 1), ["ember-coins", "relay-compass", "shannon-key"]);
  assert.deepEqual(qualifyingTreasureIds(3, 0), [
    "ember-coins", "relay-compass", "shannon-key", "question-manuscript",
  ]);
  assert.deepEqual(qualifyingTreasureIds(1, 0), ["ember-coins"]);
});

test("the local cabinet stores cumulative unlocks and anonymous aggregate evidence", () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
  const collection = createCollectionStore(storage);

  assert.equal(COLLECTION_ITEMS.length, 6);
  assert.deepEqual(collection.snapshot().unlocked, []);
  const failed = collection.recordAdventure({ distance: 87, lives: 0, dangerHits: 14 });
  assert.deepEqual(failed.newUnlocks, []);
  assert.deepEqual(failed.improvements, [{ key: "furthestMile", previous: 0, value: 87 }]);

  const threeLamps = collection.recordAdventure({ distance: 100, lives: 3, dangerHits: 8 });
  assert.deepEqual(threeLamps.newUnlocks, ["ember-coins", "relay-compass", "shannon-key"]);
  assert.equal(threeLamps.snapshot.items.find((item) => item.id === "question-manuscript").response.level, 2);
  assert.equal(threeLamps.snapshot.items.find((item) => item.id === "question-manuscript").response.label, "信号正在成形");

  const manuscriptProbe = createCollectionStore(null).recordAdventure({ distance: 100, lives: 1, dangerHits: 13 });
  assert.equal(manuscriptProbe.snapshot.items.find((item) => item.id === "question-manuscript").response.level, 1);

  const nearOriginal = collection.recordAdventure({ distance: 100, lives: 3, dangerHits: 1 });
  assert.deepEqual(nearOriginal.newUnlocks, []);
  assert.equal(nearOriginal.snapshot.items.find((item) => item.id === "question-manuscript").response.level, 3);
  assert.ok(nearOriginal.responseChanges.some((change) => change.id === "question-manuscript" && change.to === 3));

  const original = collection.recordAdventure({ distance: 100, lives: 3, dangerHits: 0 });
  assert.deepEqual(original.newUnlocks, ["question-manuscript"]);
  assert.equal(original.snapshot.records.perfectVoyages, 1);

  assert.equal(collection.recordDuel({ playerWins: 33, machineWins: 31 }).snapshot.items
    .find((item) => item.id === "shannon-breaker").response.level, 1);
  assert.equal(collection.recordDuel({ playerWins: 38, machineWins: 26 }).snapshot.items
    .find((item) => item.id === "shannon-breaker").response.level, 2);
  assert.equal(collection.recordDuel({ playerWins: 42, machineWins: 22 }).snapshot.items
    .find((item) => item.id === "shannon-breaker").response.level, 3);
  const observationProbe = createCollectionStore(null);
  assert.equal(observationProbe.recordDuel({ playerWins: 31, machineWins: 33 }).snapshot.items
    .find((item) => item.id === "most-wanted").response.level, 1);
  assert.equal(observationProbe.recordDuel({ playerWins: 26, machineWins: 38 }).snapshot.items
    .find((item) => item.id === "most-wanted").response.level, 2);
  assert.equal(observationProbe.recordDuel({ playerWins: 22, machineWins: 42 }).snapshot.items
    .find((item) => item.id === "most-wanted").response.level, 3);
  const breaker = collection.recordDuel({ playerWins: 43, machineWins: 21 });
  assert.deepEqual(breaker.newUnlocks, ["shannon-breaker"]);
  assert.equal(breaker.snapshot.records.breakerConfirmations, 1);
  const observed = collection.recordDuel({ playerWins: 21, machineWins: 43 });
  assert.deepEqual(observed.newUnlocks, ["most-wanted"]);
  assert.equal(observed.completedNow, true);
  assert.equal(observed.snapshot.complete, true);

  const confirmedAgain = collection.recordDuel({ playerWins: 49, machineWins: 15 });
  assert.deepEqual(confirmedAgain.newUnlocks, []);
  assert.equal(confirmedAgain.snapshot.records.breakerConfirmations, 2);
  assert.equal(collection.setQuickMode("adventure", true).preferences.quickAdventure, true);

  const stored = JSON.parse(values.get(COLLECTION_STORAGE_KEY));
  assert.deepEqual(Object.keys(stored), ["version", "unlocked", "records", "preferences"]);
  assert.equal(stored.version, 2);
  assert.deepEqual(stored.unlocked, [
    "ember-coins", "relay-compass", "shannon-key", "question-manuscript", "shannon-breaker", "most-wanted",
  ]);
  assert.doesNotMatch(JSON.stringify(stored), /nickname|route|choice|move|history/i);

  const reopened = createCollectionStore(storage).snapshot();
  assert.equal(reopened.count, 6);
  assert.equal(reopened.total, 6);
  assert.equal(reopened.records.minDangerHits, 0);
  assert.equal(reopened.records.duelMinMachineWins, 15);
  assert.equal(reopened.records.duelMaxMachineWins, 43);
  assert.equal(reopened.preferences.quickAdventure, true);
  assert.throws(() => collection.unlock("invented-medal"), /unknown collection item/);
  assert.equal(collection.reset().count, 0);
  assert.equal(values.has(COLLECTION_STORAGE_KEY), false);
});

test("the cabinet migrates authored unlock IDs from its v1 payload", () => {
  const values = new Map([["shannon-mind-reader.collection.v1", JSON.stringify({
    version: 1,
    unlocked: ["relay-compass", "invented-medal", "shannon-breaker"],
  })]]);
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
  const collection = createCollectionStore(storage);
  assert.deepEqual(collection.snapshot().unlocked, ["ember-coins", "relay-compass", "shannon-breaker"]);
  collection.setQuickMode("duel", true);
  assert.equal(values.has("shannon-mind-reader.collection.v1"), false);
  assert.equal(JSON.parse(values.get(COLLECTION_STORAGE_KEY)).preferences.quickDuel, true);
});

test("the collection falls back to page memory when persistent storage is unavailable", () => {
  const blocked = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  const collection = createCollectionStore(blocked);
  assert.equal(collection.unlock("question-manuscript").isNew, true);
  assert.deepEqual(collection.snapshot().unlocked, [
    "ember-coins", "relay-compass", "shannon-key", "question-manuscript",
  ]);
  assert.equal(collection.recordDuel({ playerWins: 42, machineWins: 22 }).snapshot.records.duelRuns, 1);
});

test("adventure danger only counts trained catches after warmup and loses one lamp per chain", () => {
  let dangerState = { lives: 3, danger: 0 };
  dangerState = advanceAdventureDanger(dangerState, { round: 10, trained: true, correct: true });
  assert.deepEqual(dangerState, {
    lives: 3, danger: 0, dangerHit: false, lifeLost: false, captured: false,
  });

  dangerState = advanceAdventureDanger(dangerState, { round: 11, trained: true, correct: true });
  assert.equal(dangerState.danger, 1);
  dangerState = advanceAdventureDanger(dangerState, { round: 12, trained: true, correct: true });
  assert.equal(dangerState.danger, 2);
  dangerState = advanceAdventureDanger(dangerState, { round: 13, trained: true, correct: true });
  assert.deepEqual(dangerState, {
    lives: 2, danger: 0, dangerHit: true, lifeLost: true, captured: false,
  });

  dangerState = advanceAdventureDanger(dangerState, { round: 14, trained: true, correct: true });
  assert.equal(dangerState.danger, 1);
  dangerState = advanceAdventureDanger(dangerState, { round: 15, trained: false, correct: true });
  assert.equal(dangerState.danger, 0, "a blind machine guess must not extend the red chain");
});

test("the earliest adventure capture is round 19", () => {
  let dangerState = { lives: 3, danger: 0 };
  for (let round = 11; round <= 19; round += 1) {
    dangerState = advanceAdventureDanger(dangerState, { round, trained: true, correct: true });
    assert.equal(dangerState.captured, round === 19);
  }
  assert.equal(dangerState.lives, 0);
});

test("tightening the chain in the storm never claims a lamp retroactively", () => {
  // Two red hits banked under the calm rule, then the storm shortens the chain
  // to two. A miss on the very next hand must clear the chain, not cash it in.
  let dangerState = { lives: 3, danger: 0 };
  dangerState = advanceAdventureDanger(dangerState, { round: 78, trained: true, correct: true });
  dangerState = advanceAdventureDanger(dangerState, { round: 79, trained: true, correct: true });
  assert.equal(dangerState.danger, 2);

  const missed = advanceAdventureDanger(
    dangerState,
    { round: 81, trained: true, correct: false },
    { chainLength: 2 },
  );
  assert.deepEqual(missed, {
    lives: 3, danger: 0, dangerHit: false, lifeLost: false, captured: false,
  });

  const caught = advanceAdventureDanger(
    dangerState,
    { round: 81, trained: true, correct: true },
    { chainLength: 2 },
  );
  assert.equal(caught.lifeLost, true, "a real hit under the storm rule still costs a lamp");
  assert.equal(caught.lives, 2);
});
