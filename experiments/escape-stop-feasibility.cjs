#!/usr/bin/env node

"use strict";

const { LEFT, RIGHT, binomialTwoSided } = require("../src/engine.js");

const SESSIONS = Number(process.argv[2] || 10000);
const CHECKPOINTS = [90, 120, 150];
const ALPHA = 0.05 / CHECKPOINTS.length;

function randomFor(seed) {
  let value = seed >>> 0;
  return function random() {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function opposite(choice) {
  return choice === LEFT ? RIGHT : LEFT;
}

function fair(choices, random) {
  return random() < 0.5 ? LEFT : RIGHT;
}

function typical(choices, random) {
  if (choices.length < 2) return fair(choices, random);
  const last = choices.at(-1);
  const repeated = last === choices.at(-2);
  const switchProbability = repeated ? 0.69 : 0.6;
  return random() < switchProbability ? opposite(last) : last;
}

function analyse(choices) {
  let opportunities = 0;
  let switches = 0;
  for (let index = 2; index < choices.length; index += 1) {
    if (choices[index - 2] !== choices[index - 1]) continue;
    opportunities += 1;
    if (choices[index] !== choices[index - 1]) switches += 1;
  }
  const rate = opportunities ? switches / opportunities : 0.5;
  const p = opportunities ? binomialTwoSided(switches, opportunities, 0.5) : 1;
  return {
    opportunities,
    rate,
    revealable: opportunities >= 25 && p < ALPHA && Math.abs(rate - 0.5) >= 0.1,
  };
}

function simulate(policy, seed) {
  const random = randomFor(seed);
  const choices = [];
  for (let round = 1; round <= 150; round += 1) {
    choices.push(policy(choices, random));
    if (CHECKPOINTS.includes(round) && analyse(choices).revealable) return round;
  }
  return null;
}

function report(name, policy) {
  const stops = Array.from({ length: SESSIONS }, (_, index) => simulate(policy, index + 1));
  return {
    人群: name,
    "第090格收官": `${(stops.filter((value) => value === 90).length / SESSIONS * 100).toFixed(1)}%`,
    "第120格收官": `${(stops.filter((value) => value === 120).length / SESSIONS * 100).toFixed(1)}%`,
    "第150格找到证据": `${(stops.filter((value) => value === 150).length / SESSIONS * 100).toFixed(1)}%`,
    "到150仍无证据": `${(stops.filter((value) => value === null).length / SESSIONS * 100).toFixed(1)}%`,
    总揭露率: `${(stops.filter((value) => value !== null).length / SESSIONS * 100).toFixed(1)}%`,
  };
}

console.log(`Escape checkpoint simulation · ${SESSIONS} sessions · alpha/check = ${ALPHA.toFixed(4)}`);
console.table([
  report("真随机", fair),
  report("典型切换偏差", typical),
]);
