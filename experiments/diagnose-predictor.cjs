#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const { LEFT, RIGHT, createPredictor } = require("../src/engine.js");

const HORIZON = 150;
const WARMUP = 30;

function randomFor(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function opposite(choice) {
  return choice === LEFT ? RIGHT : LEFT;
}

function createBackoffReference(maxOrder = 5) {
  const history = [];
  const tables = Array.from({ length: maxOrder + 1 }, () => new Map());

  function context(order) {
    if (order === 0) return "*";
    if (history.length < order) return null;
    return history.slice(-order).join("");
  }

  function predict() {
    for (let order = maxOrder; order >= 0; order -= 1) {
      const key = context(order);
      if (key === null) continue;
      const counts = tables[order].get(key);
      if (!counts || counts[0] + counts[1] < 2 || counts[0] === counts[1]) continue;
      return counts[1] > counts[0] ? RIGHT : LEFT;
    }
    return history.length && history.at(-1) === LEFT ? RIGHT : LEFT;
  }

  function observe(choice) {
    for (let order = 0; order <= maxOrder; order += 1) {
      const key = context(order);
      if (key === null) continue;
      const counts = tables[order].get(key) || [0, 0];
      counts[choice === RIGHT ? 1 : 0] += 1;
      tables[order].set(key, counts);
    }
    history.push(choice);
  }

  return { predict, observe };
}

function replay(choices, seed = 1953) {
  const production = createPredictor({ seed, maxOrder: 5, eta: 0.85 });
  const reference = createBackoffReference(5);
  const rows = [];

  choices.forEach((choice, index) => {
    const sealedA = production.predict();
    const sealedB = production.predict();
    assert.equal(sealedA, sealedB, `prediction ${index + 1} was not stably sealed`);
    const referenceChoice = reference.predict();
    const observed = production.observe(choice);
    assert.equal(observed.predicted, sealedA.choice, `prediction ${index + 1} changed during observe`);
    reference.observe(choice);
    rows.push({
      production: observed.correct,
      reference: referenceChoice === choice,
      predicted: observed.predicted,
      actual: choice,
      confidence: observed.confidence,
    });
  });

  const summarise = (key, start = 0) => rows.slice(start).filter((row) => row[key]).length / (rows.length - start);
  return {
    rows,
    production: summarise("production"),
    productionAfterWarmup: summarise("production", WARMUP),
    reference: summarise("reference"),
    referenceAfterWarmup: summarise("reference", WARMUP),
  };
}

function periodic(pattern) {
  return Array.from({ length: HORIZON }, (_, index) => pattern[index % pattern.length]);
}

function fairChoices(seed) {
  const random = randomFor(seed);
  return Array.from({ length: HORIZON }, () => random() < 0.5 ? LEFT : RIGHT);
}

function typicalChoices(seed) {
  const random = randomFor(seed);
  const choices = [];
  for (let index = 0; index < HORIZON; index += 1) {
    if (index < 2) choices.push(random() < 0.5 ? LEFT : RIGHT);
    else {
      const repeated = choices.at(-1) === choices.at(-2);
      const switchProbability = repeated ? 0.69 : 0.6;
      choices.push(random() < switchProbability ? opposite(choices.at(-1)) : choices.at(-1));
    }
  }
  return choices;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const patterns = [
  [LEFT],
  [LEFT, RIGHT],
  [LEFT, LEFT, RIGHT, RIGHT],
  [LEFT, LEFT, RIGHT],
  [LEFT, LEFT, RIGHT, RIGHT, RIGHT],
];

const patternRows = patterns.map((pattern, index) => {
  const result = replay(periodic(pattern), 100 + index);
  assert.ok(
    result.productionAfterWarmup >= 0.9,
    `production stayed near chance on period ${pattern.join("")}: ${result.productionAfterWarmup}`,
  );
  assert.ok(
    result.productionAfterWarmup >= result.referenceAfterWarmup - 0.08,
    `production lagged reference on ${pattern.join("")}`,
  );
  return {
    输入: pattern.join(""),
    生产全程: `${(result.production * 100).toFixed(1)}%`,
    "生产31–150": `${(result.productionAfterWarmup * 100).toFixed(1)}%`,
    "参考31–150": `${(result.referenceAfterWarmup * 100).toFixed(1)}%`,
  };
});

const fair = Array.from({ length: 1000 }, (_, index) => replay(fairChoices(index + 1), index + 1).production);
const typical = Array.from({ length: 1000 }, (_, index) => replay(typicalChoices(index + 1), index + 1).production);
const fairMean = mean(fair);
const typicalMean = mean(typical);

assert.ok(fairMean > 0.49 && fairMean < 0.51, `fair input mean was ${fairMean}`);
assert.ok(typicalMean > 0.56 && typicalMean < 0.61, `typical input mean was ${typicalMean}`);

console.log("PASS: production predictor is sealed before observe and learns deterministic periods.");
console.table(patternRows);
console.table([
  { 人群: "真随机", 会话数: 1000, 平均命中: `${(fairMean * 100).toFixed(2)}%` },
  { 人群: "模拟典型偏差", 会话数: 1000, 平均命中: `${(typicalMean * 100).toFixed(2)}%` },
]);
