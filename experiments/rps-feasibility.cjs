#!/usr/bin/env node

"use strict";

const ROCK = 0;
const PAPER = 1;
const SCISSORS = 2;
const MOVES = [ROCK, PAPER, SCISSORS];
const HORIZON = 150;
const SESSIONS = Number(process.argv[2] || 1000);

function counter(move) {
  return (move + 1) % 3;
}

function outcomeForUser(user, machine) {
  if (user === machine) return "draw";
  return user === counter(machine) ? "win" : "loss";
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

function sample(random, probabilities) {
  const target = random();
  let cumulative = 0;
  for (let index = 0; index < probabilities.length; index += 1) {
    cumulative += probabilities[index];
    if (target < cumulative) return index;
  }
  return probabilities.length - 1;
}

function softmax(logWeights) {
  const max = Math.max(...logWeights);
  const values = logWeights.map((weight) => Math.exp(weight - max));
  const total = values.reduce((sum, weight) => sum + weight, 0);
  return values.map((weight) => weight / total);
}

function createRpsPredictor(seed) {
  const random = mulberry32(seed ^ 0x1953);
  const rounds = [];
  const experts = [
    { name: "frequency", context: () => "*", table: new Map() },
    { name: "user-1", context: (past) => past.length >= 1 ? `${past.at(-1).user}` : null, table: new Map() },
    { name: "user-2", context: (past) => past.length >= 2 ? past.slice(-2).map((round) => round.user).join("") : null, table: new Map() },
    { name: "user-3", context: (past) => past.length >= 3 ? past.slice(-3).map((round) => round.user).join("") : null, table: new Map() },
    { name: "outcome-1", context: (past) => past.length >= 1 ? past.at(-1).outcome : null, table: new Map() },
    { name: "user-outcome", context: (past) => past.length >= 1 ? `${past.at(-1).user}|${past.at(-1).outcome}` : null, table: new Map() },
    { name: "machine-outcome", context: (past) => past.length >= 1 ? `${past.at(-1).machine}|${past.at(-1).outcome}` : null, table: new Map() },
    { name: "full-last-round", context: (past) => past.length >= 1 ? `${past.at(-1).user}|${past.at(-1).machine}|${past.at(-1).outcome}` : null, table: new Map() },
    { name: "outcome-2", context: (past) => past.length >= 2 ? past.slice(-2).map((round) => round.outcome[0]).join("") : null, table: new Map() },
  ];
  const logWeights = experts.map(() => 0);

  function probabilities(expert, context) {
    if (context === null) return [1 / 3, 1 / 3, 1 / 3];
    const counts = expert.table.get(context) || [0, 0, 0];
    const total = counts[0] + counts[1] + counts[2] + 1.5;
    return counts.map((count) => (count + 0.5) / total);
  }

  function play(userMove) {
    const contexts = experts.map((expert) => expert.context(rounds));
    const expertProbabilities = experts.map((expert, index) => probabilities(expert, contexts[index]));
    const weights = softmax(logWeights);
    const mixture = MOVES.map((move) => expertProbabilities.reduce(
      (sum, current, index) => sum + current[move] * weights[index],
      0,
    ));
    const maximum = Math.max(...mixture);
    const tied = MOVES.filter((move) => Math.abs(mixture[move] - maximum) < 1e-12);
    const prediction = tied[Math.floor(random() * tied.length)];
    const machineMove = counter(prediction);
    const outcome = outcomeForUser(userMove, machineMove);

    expertProbabilities.forEach((current, index) => {
      logWeights[index] += 0.85 * Math.log(Math.max(current[userMove], 1e-9));
    });
    const maxWeight = Math.max(...logWeights);
    logWeights.forEach((_, index) => {
      logWeights[index] -= maxWeight;
    });

    experts.forEach((expert, index) => {
      const context = contexts[index];
      if (context === null) return;
      const counts = expert.table.get(context) || [0, 0, 0];
      counts[userMove] += 1;
      expert.table.set(context, counts);
    });

    const round = {
      user: userMove,
      prediction,
      machine: machineMove,
      predictionCorrect: prediction === userMove,
      outcome,
    };
    rounds.push(round);
    return round;
  }

  return { play, rounds };
}

function uniform({ random }) {
  return Math.floor(random() * 3);
}

function weakMoveBias({ random }) {
  return sample(random, [0.4, 0.31, 0.29]);
}

function winStayLoseShift({ random, rounds }) {
  if (rounds.length === 0) return uniform({ random });
  const last = rounds.at(-1);
  if (last.outcome === "win" && random() < 0.6) return last.user;
  if (last.outcome === "loss" && random() < 0.7) {
    const alternatives = MOVES.filter((move) => move !== last.user);
    return alternatives[Math.floor(random() * alternatives.length)];
  }
  return uniform({ random });
}

function weakRevenge({ random, rounds }) {
  if (rounds.length === 0) return weakMoveBias({ random });
  const last = rounds.at(-1);
  if (last.outcome === "win" && random() < 0.58) return last.user;
  if (last.outcome === "loss" && random() < 0.62) return counter(last.machine);
  if (last.outcome === "draw" && random() < 0.52) return counter(last.user);
  return weakMoveBias({ random });
}

function strongRevenge({ random, rounds }) {
  if (rounds.length === 0) return uniform({ random });
  const last = rounds.at(-1);
  if (last.outcome === "win" && random() < 0.78) return last.user;
  if (last.outcome === "loss" && random() < 0.8) return counter(last.machine);
  if (last.outcome === "draw" && random() < 0.72) return counter(last.user);
  return uniform({ random });
}

function cyclic({ random, rounds }) {
  if (rounds.length === 0) return uniform({ random });
  return random() < 0.82 ? counter(rounds.at(-1).user) : uniform({ random });
}

function chaseMachine({ random, rounds }) {
  if (rounds.length === 0) return uniform({ random });
  return random() < 0.72 ? counter(rounds.at(-1).machine) : uniform({ random });
}

function balanceOwnMoves({ random, rounds }) {
  const counts = [0, 0, 0];
  rounds.forEach((round) => {
    counts[round.user] += 1;
  });
  const minimum = Math.min(...counts);
  const candidates = MOVES.filter((move) => counts[move] === minimum);
  return random() < 0.82
    ? candidates[Math.floor(random() * candidates.length)]
    : uniform({ random });
}

const policies = [
  ["外部随机源", uniform],
  ["弱出拳偏好", weakMoveBias],
  ["赢留输换·无方向", winStayLoseShift],
  ["典型复仇反应（假设）", weakRevenge],
  ["强复仇反应", strongRevenge],
  ["固定轮换", cyclic],
  ["追打机器上一手", chaseMachine],
  ["刻意凑平三种手势", balanceOwnMoves],
];

function simulate(policy, seed) {
  const random = mulberry32(seed);
  const predictor = createRpsPredictor(seed);
  const rounds = [];

  for (let index = 0; index < HORIZON; index += 1) {
    const userMove = policy({ random, rounds, index });
    rounds.push(predictor.play(userMove));
  }

  return rounds;
}

function quantile(sorted, probability) {
  return sorted[Math.floor((sorted.length - 1) * probability)];
}

function summarise(policy) {
  const sessions = Array.from({ length: SESSIONS }, (_, index) => simulate(policy, index + 1));
  const accuracies = sessions.map((rounds) => (
    rounds.filter((round) => round.predictionCorrect).length / HORIZON
  )).sort((a, b) => a - b);
  const machineWins = sessions.map((rounds) => (
    rounds.filter((round) => round.outcome === "loss").length / HORIZON
  ));
  const userWins = sessions.map((rounds) => (
    rounds.filter((round) => round.outcome === "win").length / HORIZON
  ));

  return {
    meanAccuracy: accuracies.reduce((sum, value) => sum + value, 0) / SESSIONS,
    medianAccuracy: quantile(accuracies, 0.5),
    p05: quantile(accuracies, 0.05),
    p95: quantile(accuracies, 0.95),
    atLeast45: accuracies.filter((value) => value >= 0.45).length / SESSIONS,
    atLeast60: accuracies.filter((value) => value >= 0.6).length / SESSIONS,
    machineWin: machineWins.reduce((sum, value) => sum + value, 0) / SESSIONS,
    userWin: userWins.reduce((sum, value) => sum + value, 0) / SESSIONS,
  };
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

const rows = policies.map(([name, policy]) => {
  const result = summarise(policy);
  return {
    策略: name,
    平均猜中: pct(result.meanAccuracy),
    中位数: pct(result.medianAccuracy),
    "P05–P95": `${pct(result.p05)}–${pct(result.p95)}`,
    "会话≥45%": pct(result.atLeast45),
    "会话≥60%": pct(result.atLeast60),
    机器胜率: pct(result.machineWin),
    玩家胜率: pct(result.userWin),
  };
});

console.log(`RPS closed-loop simulation · n=${SESSIONS} sessions/policy · ${HORIZON} rounds`);
console.log("Prediction baseline: 33.3%. A machine win means its counter-move beat the user.");
console.table(rows);
