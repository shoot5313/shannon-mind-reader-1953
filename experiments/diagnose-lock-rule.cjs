#!/usr/bin/env node

"use strict";

const { LEFT, RIGHT, createPredictor, createShannonPredictor } = require("../src/engine.js");

const HORIZON = 150;
const SESSIONS = 5000;
const ACTIVE_FROM = 30;
const MODEL = process.env.MR_MODEL === "shannon" ? "shannon" : "mixture";

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

function choicesFor(seed, policy) {
  const random = randomFor(seed);
  const choices = [];
  for (let index = 0; index < HORIZON; index += 1) {
    if (policy === "fair" || index < 2) {
      choices.push(random() < 0.5 ? LEFT : RIGHT);
      continue;
    }
    const repeated = choices.at(-1) === choices.at(-2);
    const switchChance = repeated ? 0.69 : 0.6;
    choices.push(random() < switchChance ? opposite(choices.at(-1)) : choices.at(-1));
  }
  return choices;
}

function play(seed, policy) {
  const predictor = MODEL === "shannon"
    ? createShannonPredictor({ seed: seed ^ 0xa53c })
    : createPredictor({ seed: seed ^ 0xa53c, maxOrder: 5, eta: 0.85 });
  const random = randomFor(seed ^ 0xc017);
  const records = [];
  const fixed = policy === "reactive" ? null : choicesFor(seed, policy);
  for (let index = 0; index < HORIZON; index += 1) {
    const last = records.at(-1);
    const choice = policy !== "reactive"
      ? fixed[index]
      : !last || random() >= 0.82
        ? random() < 0.5 ? LEFT : RIGHT
        : last.correct ? opposite(last.actual) : last.actual;
    const pending = predictor.predict();
    const observed = predictor.observe(choice);
    records.push({ actual: choice, correct: observed.correct, confidence: pending.confidence });
  }
  return records;
}

function maxRun(records, threshold = 0.5) {
  let run = 0;
  let maximum = 0;
  records.slice(ACTIVE_FROM).forEach((record) => {
    run = record.correct && record.confidence >= threshold ? run + 1 : 0;
    maximum = Math.max(maximum, run);
  });
  return maximum;
}

function lockCount(records, threshold, length) {
  let run = 0;
  let locks = 0;
  records.slice(ACTIVE_FROM).forEach((record) => {
    run = record.correct && record.confidence >= threshold ? run + 1 : 0;
    if (run === length) {
      locks += 1;
      run = 0;
    }
  });
  return locks;
}

function losesEveryZone(records, threshold = 0.6, length = 3) {
  const zones = [[30, 70], [70, 110], [110, 150]];
  return zones.every(([start, end]) => {
    let run = 0;
    for (const record of records.slice(start, end)) {
      run = record.correct && record.confidence >= threshold ? run + 1 : 0;
      if (run >= length) return true;
    }
    return false;
  });
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function quantile(values, probability) {
  const ordered = values.slice().sort((a, b) => a - b);
  return ordered[Math.floor((ordered.length - 1) * probability)];
}

const rules = [
  { label: "任意命中连续 3 次", threshold: 0.5, length: 3 },
  { label: "任意命中连续 5 次", threshold: 0.5, length: 5 },
  { label: "任意命中连续 6 次", threshold: 0.5, length: 6 },
  { label: "把握≥55% 且连续命中 3 次", threshold: 0.55, length: 3 },
  { label: "把握≥58% 且连续命中 3 次", threshold: 0.58, length: 3 },
  { label: "把握≥60% 且连续命中 3 次", threshold: 0.6, length: 3 },
  { label: "把握≥58% 且连续命中 4 次", threshold: 0.58, length: 4 },
  { label: "把握≥60% 且连续命中 4 次", threshold: 0.6, length: 4 },
  { label: "把握≥62% 且连续命中 3 次", threshold: 0.62, length: 3 },
  { label: "把握≥65% 且连续命中 3 次", threshold: 0.65, length: 3 },
];

const populations = ["fair", "typical", "reactive"].map((policy, policyIndex) => {
  const sessions = Array.from({ length: SESSIONS }, (_, index) => play(index + 1 + policyIndex * 10000, policy));
  const maxes = sessions.map((records) => maxRun(records));
  return {
    policy,
    sessions,
    medianMax: quantile(maxes, 0.5),
    p90Max: quantile(maxes, 0.9),
  };
});

console.log(`Model: ${MODEL}. Lock rules are evaluated only after round ${ACTIVE_FROM}; ${SESSIONS} sessions per population.`);
console.table(populations.map((population) => ({
  输入: population.policy === "fair" ? "真随机按键" : population.policy === "typical" ? "模拟典型偏差" : "被抓就换；脱身就留",
  最长连中中位数: population.medianMax,
  最长连中第九十分位: population.p90Max,
})));

console.table(rules.map((rule) => {
  const row = { 判负规则: rule.label };
  populations.forEach((population) => {
    const rate = population.sessions.filter((records) => maxRun(records, rule.threshold) >= rule.length).length / SESSIONS;
    const label = population.policy === "fair" ? "真随机也输" : population.policy === "typical" ? "典型偏差会输" : "反馈反应会输";
    row[label] = percent(rate);
  });
  return row;
}));

const lockRules = [
  { label: "任意五连中，累计 2 次锁定", threshold: 0.5, length: 5, locks: 2 },
  { label: "任意五连中，累计 3 次锁定", threshold: 0.5, length: 5, locks: 3 },
  { label: "任意六连中，累计 2 次锁定", threshold: 0.5, length: 6, locks: 2 },
  { label: "≥58% 把握三连中，累计 2 次锁定", threshold: 0.58, length: 3, locks: 2 },
  { label: "≥58% 把握三连中，累计 3 次锁定", threshold: 0.58, length: 3, locks: 3 },
  { label: "≥60% 把握三连中，累计 2 次锁定", threshold: 0.6, length: 3, locks: 2 },
  { label: "≥60% 把握三连中，累计 3 次锁定", threshold: 0.6, length: 3, locks: 3 },
  { label: "≥58% 把握四连中，累计 2 次锁定", threshold: 0.58, length: 4, locks: 2 },
];

console.table(lockRules.map((rule) => {
  const row = { 判负规则: rule.label };
  populations.forEach((population) => {
    const counts = population.sessions.map((records) => lockCount(records, rule.threshold, rule.length));
    const rate = counts.filter((count) => count >= rule.locks).length / SESSIONS;
    const label = population.policy === "fair" ? "真随机也输" : population.policy === "typical" ? "典型偏差会输" : "反馈反应会输";
    row[label] = percent(rate);
  });
  return row;
}));

const zonedRow = { 判负规则: "ACT II / III / IV 各一次三连记忆命中" };
populations.forEach((population) => {
  const rate = population.sessions.filter((records) => losesEveryZone(records)).length / SESSIONS;
  const label = population.policy === "fair" ? "真随机也输" : population.policy === "typical" ? "典型偏差会输" : "反馈反应会输";
  zonedRow[label] = percent(rate);
});
console.table([zonedRow]);
