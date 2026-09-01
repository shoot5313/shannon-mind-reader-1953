#!/usr/bin/env node

"use strict";

const { readFileSync } = require("node:fs");
const {
  LEFT,
  RIGHT,
  createPredictor,
  createShannonPredictor,
} = require("../src/engine.js");

const paths = process.argv.slice(2);
const selfTest = paths.length === 1 && paths[0] === "--self-test";
if (!paths.length) {
  process.stderr.write("Usage: node experiments/analyse-pilot.cjs pilot-1.json [pilot-2.json ...]\n");
  process.exit(1);
}

function percent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
}

function side(value) {
  if (value !== LEFT && value !== RIGHT) throw new Error(`invalid side: ${value}`);
  return value;
}

function replay(payload) {
  if (!Number.isInteger(payload.predictor_seed)) throw new Error("missing integer predictor_seed");
  if (!Array.isArray(payload.records) || !payload.records.length) throw new Error("missing records");

  const shannon = createShannonPredictor({ seed: payload.predictor_seed });
  const mixture = createPredictor({ seed: payload.predictor_seed, maxOrder: 5, eta: 0.85 });
  let mismatches = 0;
  let mixtureCorrect = 0;
  let scored = 0;

  payload.records.forEach((row, index) => {
    const choice = side(row.choice);
    const pending = shannon.predict();
    const observed = shannon.observe(choice);
    const mixtureObserved = mixture.observe(choice);
    const expected = {
      round: index + 1,
      prediction: pending.choice,
      correct: observed.correct,
      state: observed.state,
      trained: observed.trained,
      predicted_reaction: observed.predictedReaction,
      reaction: observed.reaction,
    };
    for (const [key, value] of Object.entries(expected)) {
      if (row[key] !== value) mismatches += 1;
    }
    if (!row.external_random) {
      scored += 1;
      if (mixtureObserved.correct) mixtureCorrect += 1;
    }
  });

  const human = payload.records.filter((record) => !record.external_random);
  const correct = human.filter((record) => record.correct).length;
  const trained = human.filter((record) => record.trained);
  const trainedCorrect = trained.filter((record) => record.correct).length;
  let caughtPrevious = 0;
  let switchedAfterCaught = 0;
  let escapedPrevious = 0;
  let stayedAfterEscape = 0;

  for (let index = 1; index < payload.records.length; index += 1) {
    const previous = payload.records[index - 1];
    const current = payload.records[index];
    if (previous.external_random || current.external_random) continue;
    const switched = current.choice !== previous.choice;
    if (previous.correct) {
      caughtPrevious += 1;
      if (switched) switchedAfterCaught += 1;
    } else {
      escapedPrevious += 1;
      if (!switched) stayedAfterEscape += 1;
    }
  }

  return {
    participant: payload.participant || "—",
    rounds: payload.records.length,
    "逐格重放": mismatches ? `${mismatches} 处不一致` : "PASS",
    "Shannon 命中": percent(correct / human.length),
    "旧混合器命中": percent(mixtureCorrect / scored),
    "记忆出手": trained.length,
    "记忆出手命中": percent(trained.length ? trainedCorrect / trained.length : NaN),
    "被抓后换边": percent(caughtPrevious ? switchedAfterCaught / caughtPrevious : NaN),
    "脱身后留边": percent(escapedPrevious ? stayedAfterEscape / escapedPrevious : NaN),
    "玩家:机器": correct ? `${human.length - correct}:${correct}` : "∞",
    "3:1 大奖": human.length === 150 && human.length - correct > correct * 3 ? "YES" : "no",
  };
}

function makeSelfTestPayload() {
  const predictorSeed = 1953;
  const machine = createShannonPredictor({ seed: predictorSeed });
  const pattern = [LEFT, LEFT, RIGHT, RIGHT];
  const records = Array.from({ length: 150 }, (_, index) => {
    const choice = pattern[index % pattern.length];
    const pending = machine.predict();
    const observed = machine.observe(choice);
    return {
      round: index + 1,
      choice,
      prediction: pending.choice,
      correct: observed.correct,
      confidence: observed.confidence,
      state: observed.state,
      trained: observed.trained,
      predicted_reaction: observed.predictedReaction,
      reaction: observed.reaction,
      external_random: false,
    };
  });
  return { participant: "SELFTEST", predictor_seed: predictorSeed, records };
}

const rows = selfTest ? [replay(makeSelfTestPayload())] : paths.map((path) => {
  try {
    const payload = JSON.parse(readFileSync(path, "utf8"));
    return replay(payload);
  } catch (error) {
    return { participant: path, "逐格重放": `ERROR: ${error.message}` };
  }
});

console.table(rows);
if (rows.some((row) => row["逐格重放"] !== "PASS")) process.exitCode = 1;
