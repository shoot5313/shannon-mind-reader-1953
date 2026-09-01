#!/usr/bin/env node

"use strict";

const { LEFT, RIGHT, createPredictor } = require("../src/engine.js");

const HORIZON = 150;

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

function generateFeedbackReactive(seed, rule) {
  const random = randomFor(seed);
  const machine = createPredictor({ seed, maxOrder: 5, eta: 0.85 });
  const records = [];
  for (let index = 0; index < HORIZON; index += 1) {
    const choice = records.length
      ? rule({ last: records.at(-1), random })
      : random() < 0.5 ? LEFT : RIGHT;
    const observed = machine.observe(choice);
    records.push({
      actual: choice,
      predicted: observed.predicted,
      correct: observed.correct,
    });
  }
  return records;
}

function contextualReplay(records) {
  const tables = new Map();
  let correct = 0;
  records.forEach((record, index) => {
    const previous = index ? records[index - 1] : null;
    const context = previous
      ? `${previous.actual}|${previous.predicted}|${previous.correct ? 1 : 0}`
      : "START";
    const counts = tables.get(context) || [0, 0];
    const prediction = counts[0] === counts[1]
      ? (index && records[index - 1].actual === LEFT ? RIGHT : LEFT)
      : counts[1] > counts[0] ? RIGHT : LEFT;
    if (prediction === record.actual) correct += 1;
    counts[record.actual === RIGHT ? 1 : 0] += 1;
    tables.set(context, counts);
  });
  return correct / records.length;
}

function productionAccuracy(records) {
  return records.filter((record) => record.correct).length / records.length;
}

const policies = [
  ["被抓后换边；扑空后保持", ({ last, random }) => (
    random() < 0.82
      ? (last.correct ? opposite(last.actual) : last.actual)
      : (random() < 0.5 ? LEFT : RIGHT)
  )],
  ["追着机器上次的猜测反着走", ({ last, random }) => (
    random() < 0.82 ? opposite(last.predicted) : (random() < 0.5 ? LEFT : RIGHT)
  )],
  ["机器猜错后反而换边", ({ last, random }) => (
    random() < 0.82
      ? (!last.correct ? opposite(last.actual) : last.actual)
      : (random() < 0.5 ? LEFT : RIGHT)
  )],
];

const boundaryRows = policies.map(([name, policy], index) => {
  const sessions = Array.from({ length: 500 }, (_, seed) => generateFeedbackReactive(seed + 1 + index * 1000, policy));
  const production = sessions.map(productionAccuracy);
  const contextual = sessions.map(contextualReplay);
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    玩家反应: name,
    当前模型: `${(mean(production) * 100).toFixed(1)}%`,
    "加入上局反馈的参考模型": `${(mean(contextual) * 100).toFixed(1)}%`,
  };
});

function makeChoices(seed, typical) {
  const random = randomFor(seed);
  const choices = [];
  for (let index = 0; index < HORIZON; index += 1) {
    if (!typical || index < 2) choices.push(random() < 0.5 ? LEFT : RIGHT);
    else {
      const repeated = choices.at(-1) === choices.at(-2);
      const switchChance = repeated ? 0.69 : 0.6;
      choices.push(random() < switchChance ? opposite(choices.at(-1)) : choices.at(-1));
    }
  }
  return choices;
}

function seedSpread(choices) {
  const accuracies = Array.from({ length: 500 }, (_, seed) => {
    const predictor = createPredictor({ seed: seed + 1, maxOrder: 5, eta: 0.85 });
    return choices.filter((choice) => predictor.observe(choice).correct).length / choices.length;
  });
  const mean = accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length;
  const variance = accuracies.reduce((sum, value) => sum + (value - mean) ** 2, 0) / accuracies.length;
  return {
    mean,
    sd: Math.sqrt(variance),
    min: Math.min(...accuracies),
    max: Math.max(...accuracies),
  };
}

const fairSpread = seedSpread(makeChoices(777, false));
const typicalSpread = seedSpread(makeChoices(777, true));

console.log("Synthetic boundary probe: these policies react to information the current model does not explicitly condition on.");
console.table(boundaryRows);
console.log("Prediction-seed sensitivity on one fixed 150-choice route:");
console.table([
  { 路线: "固定真随机样本", 均值: `${(fairSpread.mean * 100).toFixed(2)}%`, 标准差: `${(fairSpread.sd * 100).toFixed(2)}pp`, 范围: `${(fairSpread.min * 100).toFixed(1)}–${(fairSpread.max * 100).toFixed(1)}%` },
  { 路线: "固定典型偏差样本", 均值: `${(typicalSpread.mean * 100).toFixed(2)}%`, 标准差: `${(typicalSpread.sd * 100).toFixed(2)}pp`, 范围: `${(typicalSpread.min * 100).toFixed(1)}–${(typicalSpread.max * 100).toFixed(1)}%` },
]);
