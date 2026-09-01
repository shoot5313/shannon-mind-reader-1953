#!/usr/bin/env node

"use strict";

const { readFileSync } = require("node:fs");

const datasetPath = process.argv[2];
if (!datasetPath) {
  process.stderr.write("usage: node replay-rps-data.cjs extracted-data.json\n");
  process.exit(1);
}

const players = JSON.parse(readFileSync(datasetPath, "utf8"));

const MOVE = { R: 0, P: 1, S: 2 };
const MOVES = [0, 1, 2];

function counter(move) {
  return (move + 1) % 3;
}

function outcomeForHuman(human, machine) {
  if (human === machine) return "draw";
  return human === counter(machine) ? "win" : "loss";
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

function softmax(logWeights) {
  const max = Math.max(...logWeights);
  const values = logWeights.map((weight) => Math.exp(weight - max));
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => value / total);
}

function createReplayPredictor(seed, contextual) {
  const random = mulberry32(seed);
  const history = [];
  const baseExperts = [
    { name: "frequency", context: () => "*" },
    { name: "user-1", context: (past) => past.length >= 1 ? `${past.at(-1).human}` : null },
    { name: "user-2", context: (past) => past.length >= 2 ? past.slice(-2).map((round) => round.human).join("") : null },
    { name: "user-3", context: (past) => past.length >= 3 ? past.slice(-3).map((round) => round.human).join("") : null },
    { name: "user-4", context: (past) => past.length >= 4 ? past.slice(-4).map((round) => round.human).join("") : null },
    { name: "user-5", context: (past) => past.length >= 5 ? past.slice(-5).map((round) => round.human).join("") : null },
  ];
  const contextExperts = [
    { name: "outcome", context: (past) => past.length >= 1 ? past.at(-1).outcome : null },
    { name: "user-outcome", context: (past) => past.length >= 1 ? `${past.at(-1).human}|${past.at(-1).outcome}` : null },
    { name: "machine-outcome", context: (past) => past.length >= 1 ? `${past.at(-1).machine}|${past.at(-1).outcome}` : null },
    { name: "full-last", context: (past) => past.length >= 1 ? `${past.at(-1).human}|${past.at(-1).machine}|${past.at(-1).outcome}` : null },
    { name: "outcome-2", context: (past) => past.length >= 2 ? past.slice(-2).map((round) => round.outcome[0]).join("") : null },
  ];
  const experts = (contextual ? baseExperts.concat(contextExperts) : baseExperts).map((expert) => ({
    ...expert,
    table: new Map(),
  }));
  const logWeights = experts.map(() => 0);

  function expertProbabilities(expert, context) {
    if (context === null) return [1 / 3, 1 / 3, 1 / 3];
    const counts = expert.table.get(context) || [0, 0, 0];
    const total = counts.reduce((sum, count) => sum + count, 1.5);
    return counts.map((count) => (count + 0.5) / total);
  }

  function observe(round) {
    const contexts = experts.map((expert) => expert.context(history));
    const probabilities = experts.map((expert, index) => (
      expertProbabilities(expert, contexts[index])
    ));
    const weights = softmax(logWeights);
    const mixture = MOVES.map((move) => probabilities.reduce(
      (sum, current, index) => sum + current[move] * weights[index],
      0,
    ));
    const best = Math.max(...mixture);
    const tied = MOVES.filter((move) => Math.abs(mixture[move] - best) < 1e-12);
    const prediction = tied[Math.floor(random() * tied.length)];

    probabilities.forEach((current, index) => {
      logWeights[index] += 0.85 * Math.log(Math.max(current[round.human], 1e-9));
    });
    const maxWeight = Math.max(...logWeights);
    logWeights.forEach((_, index) => {
      logWeights[index] -= maxWeight;
    });
    experts.forEach((expert, index) => {
      const context = contexts[index];
      if (context === null) return;
      const counts = expert.table.get(context) || [0, 0, 0];
      counts[round.human] += 1;
      expert.table.set(context, counts);
    });
    history.push(round);
    return prediction;
  }

  return { observe };
}

function replay(player, horizon, contextual, seed) {
  const predictor = createReplayPredictor(seed, contextual);
  let correct = 0;
  let originalMachineWins = 0;
  let originalHumanWins = 0;
  const rounds = player.rounds.slice(0, horizon).map((raw) => {
    const human = MOVE[raw.human];
    const machine = MOVE[raw.machine];
    return { human, machine, outcome: outcomeForHuman(human, machine) };
  });

  rounds.forEach((round) => {
    if (predictor.observe(round) === round.human) correct += 1;
    if (round.outcome === "loss") originalMachineWins += 1;
    if (round.outcome === "win") originalHumanWins += 1;
  });
  return {
    accuracy: correct / rounds.length,
    originalMachineWin: originalMachineWins / rounds.length,
    originalHumanWin: originalHumanWins / rounds.length,
  };
}

function quantile(sorted, probability) {
  return sorted[Math.floor((sorted.length - 1) * probability)];
}

function summarise(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    median: quantile(sorted, 0.5),
    p05: quantile(sorted, 0.05),
    p95: quantile(sorted, 0.95),
    atLeast45: values.filter((value) => value >= 0.45).length / values.length,
    atLeast60: values.filter((value) => value >= 0.6).length / values.length,
  };
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

const reports = [];
for (const horizon of [60, 100, 150, 300]) {
  for (const contextual of [false, true]) {
    const results = players.map((player, index) => replay(player, horizon, contextual, index + 1));
    const accuracy = summarise(results.map((result) => result.accuracy));
    const originalMachine = summarise(results.map((result) => result.originalMachineWin));
    const originalHuman = summarise(results.map((result) => result.originalHumanWin));
    reports.push({
      轮数: horizon,
      回放模型: contextual ? "序列 + 原实验反馈" : "仅玩家序列",
      平均猜中: pct(accuracy.mean),
      中位数: pct(accuracy.median),
      "P05–P95": `${pct(accuracy.p05)}–${pct(accuracy.p95)}`,
      "玩家≥45%": pct(accuracy.atLeast45),
      "玩家≥60%": pct(accuracy.atLeast60),
      原机器胜率: pct(originalMachine.mean),
      原玩家胜率: pct(originalHuman.mean),
    });
  }
}

console.log(`Published human RPS replay · ${players.length} players · ${players[0].rounds.length} rounds each`);
console.log("Source: Wang et al., Scientific Reports 10, 13873 (2020), supplementary workbooks.");
console.log("Contextual replay uses feedback generated by the paper's opponent, so it is descriptive rather than a closed-loop estimate for ours.");
console.table(reports);
