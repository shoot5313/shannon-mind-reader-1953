#!/usr/bin/env node

"use strict";

const {
  LEFT,
  RIGHT,
  createPredictor,
  createShannonPredictor: createProductionShannon,
} = require("../src/engine.js");

const HORIZON = Number(process.env.MR_HORIZON || 150);
const SESSIONS = Number(process.env.MR_SESSIONS || 2000);

function randomFor(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function opposite(choice) {
  return choice === LEFT ? RIGHT : LEFT;
}

function createShannon1953(options = {}) {
  const random = randomFor(options.seed || 1953);
  const records = [];
  const cells = new Map();
  let pending = null;

  function stateKey() {
    if (records.length < 2) return null;
    const older = records.at(-2).correct ? "M" : "H";
    const relation = records.at(-1).actual === records.at(-2).actual ? "S" : "D";
    const recent = records.at(-1).correct ? "M" : "H";
    return `${older}${relation}${recent}`;
  }

  function predict() {
    if (pending) return pending;
    const key = stateKey();
    const cell = key === null ? null : cells.get(key);
    const trained = Boolean(cell && cell.repeated);
    const predictedReaction = trained ? cell.reaction : null;
    const choice = trained
      ? predictedReaction === "S" ? records.at(-1).actual : opposite(records.at(-1).actual)
      : random() < 0.5 ? LEFT : RIGHT;
    pending = Object.freeze({
      choice,
      confidence: trained ? 1 : 0.5,
      state: key,
      trained,
      predictedReaction,
      previousActual: records.length ? records.at(-1).actual : null,
      cell: cell ? Object.freeze({ ...cell }) : null,
    });
    return pending;
  }

  function observe(choice) {
    const prediction = predict();
    const record = {
      actual: choice,
      predicted: prediction.choice,
      correct: prediction.choice === choice,
      state: prediction.state,
      trained: prediction.trained,
    };

    if (prediction.state !== null) {
      const reaction = choice === records.at(-1).actual ? "S" : "D";
      const cell = cells.get(prediction.state) || { reaction: null, repeated: false };
      if (cell.reaction === reaction) cell.repeated = true;
      else {
        cell.reaction = reaction;
        cell.repeated = false;
      }
      cells.set(prediction.state, cell);
      record.reaction = reaction;
    }

    records.push(record);
    pending = null;
    return Object.freeze(record);
  }

  function snapshot() {
    return {
      records: records.map((record) => ({ ...record })),
      cells: new Map(Array.from(cells, ([key, cell]) => [key, { ...cell }])),
    };
  }

  return { predict, observe, snapshot };
}

function ordinaryChoices(seed) {
  const random = randomFor(seed ^ 0x9173);
  const choices = [];
  for (let index = 0; index < HORIZON; index += 1) {
    if (index < 2) choices.push(random() < 0.5 ? LEFT : RIGHT);
    else {
      const repeated = choices.at(-1) === choices.at(-2);
      const switchChance = repeated ? 0.69 : 0.6;
      choices.push(random() < switchChance ? opposite(choices.at(-1)) : choices.at(-1));
    }
  }
  return choices;
}

function fairChoices(seed) {
  const random = randomFor(seed ^ 0xb137);
  return Array.from({ length: HORIZON }, () => random() < 0.5 ? LEFT : RIGHT);
}

function shannonExploitChoice(machine, seed) {
  const random = randomFor(seed ^ 0x53);
  return function choose(records) {
    const pending = machine.predict();
    const previous = records.at(-1);
    if (!previous || pending.state === null) return random() < 0.5 ? LEFT : RIGHT;
    const cell = pending.cell;
    let reaction;
    if (!cell || cell.reaction === null) reaction = random() < 0.5 ? "S" : "D";
    else if (cell.repeated) reaction = cell.reaction === "S" ? "D" : "S";
    else reaction = cell.reaction;
    return reaction === "S" ? previous.actual : opposite(previous.actual);
  };
}

function playFixed(createMachine, choices, seed) {
  const machine = createMachine({ seed });
  return choices.map((choice) => machine.observe(choice));
}

function playExploit(seed) {
  const machine = createProductionShannon({ seed });
  const choose = shannonExploitChoice(machine, seed);
  const records = [];
  for (let index = 0; index < HORIZON; index += 1) records.push(machine.observe(choose(records)));
  return records;
}

function playFeedbackReactive(createMachine, seed) {
  const machine = createMachine({ seed });
  const random = randomFor(seed ^ 0xc017);
  const records = [];
  for (let index = 0; index < HORIZON; index += 1) {
    const last = records.at(-1);
    const choice = !last || random() >= 0.82
      ? random() < 0.5 ? LEFT : RIGHT
      : last.correct ? opposite(last.actual) : last.actual;
    records.push(machine.observe(choice));
  }
  return records;
}

function summary(sessions) {
  const accuracies = sessions.map((records) => records.filter((record) => record.correct).length / records.length);
  const meanAccuracy = accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length;
  const ratios = sessions.map((records) => {
    const machineWins = records.filter((record) => record.correct).length;
    return machineWins ? (records.length - machineWins) / machineWins : Infinity;
  });
  return {
    meanAccuracy,
    meanPlayerToMachine: (1 - meanAccuracy) / meanAccuracy,
    reachedThreeToOne: ratios.filter((ratio) => ratio >= 3).length / ratios.length,
  };
}

function currentFactory({ seed }) {
  return createPredictor({ seed, maxOrder: 5, eta: 0.85 });
}

const populations = [
  ["真随机", fairChoices],
  ["模拟典型偏差", ordinaryChoices],
];

const rows = [];
for (const [label, makeChoices] of populations) {
  const shannonSessions = [];
  const currentSessions = [];
  for (let seed = 1; seed <= SESSIONS; seed += 1) {
    const choices = makeChoices(seed);
    shannonSessions.push(playFixed(createProductionShannon, choices, seed));
    currentSessions.push(playFixed(currentFactory, choices, seed));
  }
  for (const [machine, result] of [
    ["Shannon 八格", summary(shannonSessions)],
    ["当前 0–5 阶混合", summary(currentSessions)],
  ]) {
    rows.push({
      玩家: label,
      机器: machine,
      机器命中: `${(result.meanAccuracy * 100).toFixed(1)}%`,
      "玩家:机器": `${result.meanPlayerToMachine.toFixed(2)}:1`,
      "达到 3:1": `${(result.reachedThreeToOne * 100).toFixed(1)}%`,
    });
  }
}

const exploit = summary(Array.from({ length: SESSIONS }, (_, index) => playExploit(index + 1)));
for (const [machine, factory] of [
  ["Shannon 八格", createProductionShannon],
  ["当前 0–5 阶混合", currentFactory],
]) {
  const reactive = summary(Array.from({ length: SESSIONS }, (_, index) => playFeedbackReactive(factory, index + 1)));
  rows.push({
    玩家: "被抓就换；脱身就留",
    机器: machine,
    机器命中: `${(reactive.meanAccuracy * 100).toFixed(1)}%`,
    "玩家:机器": `${reactive.meanPlayerToMachine.toFixed(2)}:1`,
    "达到 3:1": `${(reactive.reachedThreeToOne * 100).toFixed(1)}%`,
  });
}
rows.push({
  玩家: "追踪八格：教会再背叛",
  机器: "Shannon 八格",
  机器命中: `${(exploit.meanAccuracy * 100).toFixed(1)}%`,
  "玩家:机器": `${exploit.meanPlayerToMachine.toFixed(2)}:1`,
  "达到 3:1": `${(exploit.reachedThreeToOne * 100).toFixed(1)}%`,
});

console.log(`${SESSIONS} sessions per row, ${HORIZON} rounds each.`);
console.table(rows);
