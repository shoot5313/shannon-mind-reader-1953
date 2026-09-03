#!/usr/bin/env node

/*
 * Difficulty calibration for the voyage and the research room.
 *
 * Run this before changing ADVENTURE_TOTAL, WARMUP, STORM_AT or the egg
 * thresholds. The published rules were retuned once already after the research
 * room shrank from 150 hands to 64 without the 3:1 achievement line moving with
 * it, which left that sticker reachable in 1% of even mathematically perfect
 * runs. Every difficulty figure quoted in DESIGN.md comes out of this file.
 *
 * The `+读灯` strategies are the same ordinary habits playing against their own
 * instinct whenever the searchlight is lit. The gap between a habit and that
 * same habit reading the light is the whole point of the light: without it,
 * coin-flipping outperformed paying attention.
 *
 *   node experiments/tune-adventure.cjs
 *   MR_SESSIONS=40000 node experiments/tune-adventure.cjs
 */

"use strict";

const {
  LEFT,
  RIGHT,
  createShannonPredictor,
  summariseShannonVisits,
  classifyEggScore,
  advanceAdventureDanger,
} = require("../src/engine.js");

const SESSIONS = Number(process.env.MR_SESSIONS || 15000);
const DUEL_TOTAL = 64;

function opposite(choice) {
  return choice === LEFT ? RIGHT : LEFT;
}

function coinToss() {
  return Math.random() < 0.5 ? LEFT : RIGHT;
}

/*
 * The reference strategies. `perfect` mirrors the machine's own state machine:
 * every input it uses is public (the player's own moves plus who won), so a
 * player with perfect recall can always play the opposite of a trained cell.
 * It marks the true skill ceiling, not an unreachable oracle.
 */
const STRATEGIES = {
  "纯随机": () => ({ choose: coinToss, learn() {} }),

  "避免连三同": () => {
    const history = [];
    return {
      choose() {
        const length = history.length;
        if (length >= 2 && history[length - 1] === history[length - 2]) {
          return Math.random() < 0.75 ? opposite(history[length - 1]) : history[length - 1];
        }
        return coinToss();
      },
      learn(choice) { history.push(choice); },
    };
  },

  "反应型人类": () => {
    const history = [];
    let lastCorrect = null;
    let lastChoice = null;
    return {
      choose() {
        const length = history.length;
        if (lastCorrect === true && Math.random() < 0.5) return opposite(lastChoice);
        if (length >= 2 && history[length - 1] === history[length - 2] && Math.random() < 0.6) {
          return opposite(history[length - 1]);
        }
        return Math.random() < 0.55 ? RIGHT : LEFT;
      },
      learn(choice, correct) {
        history.push(choice);
        lastCorrect = correct;
        lastChoice = choice;
      },
    };
  },

  "避免连三同+读灯": () => {
    const history = [];
    return {
      choose(armed) {
        const length = history.length;
        const last = history[length - 1];
        const instinct = length >= 2 && last === history[length - 2]
          ? (Math.random() < 0.75 ? opposite(last) : last)
          : coinToss();
        const choice = armed ? opposite(instinct) : instinct;
        history.push(choice);
        return choice;
      },
      learn() {},
    };
  },

  "反应型+读灯": () => {
    const history = [];
    let lastCorrect = null;
    let lastChoice = null;
    return {
      choose(armed) {
        const length = history.length;
        let instinct;
        if (lastCorrect === true && Math.random() < 0.5) instinct = opposite(lastChoice);
        else if (length >= 2 && history[length - 1] === history[length - 2] && Math.random() < 0.6) {
          instinct = opposite(history[length - 1]);
        } else instinct = Math.random() < 0.55 ? RIGHT : LEFT;
        return armed ? opposite(instinct) : instinct;
      },
      learn(choice, correct) {
        history.push(choice);
        lastCorrect = correct;
        lastChoice = choice;
      },
    };
  },

  "半熟练": () => {
    const expert = STRATEGIES["完美利用者"]();
    return {
      choose() { return Math.random() < 0.5 ? expert.choose() : coinToss(); },
      learn(choice, correct) { expert.learn(choice, correct); },
    };
  },

  "完美利用者": () => {
    const cells = new Map();
    const records = [];

    function stateKey() {
      if (records.length < 2) return null;
      const older = records[records.length - 2];
      const recent = records[records.length - 1];
      const transition = older.actual === recent.actual ? "S" : "D";
      return `${older.correct ? "L" : "W"}${transition}${recent.correct ? "L" : "W"}`;
    }

    return {
      choose() {
        const key = stateKey();
        const cell = key === null ? null : cells.get(key);
        const previous = records.length ? records[records.length - 1].actual : null;
        if (cell && cell.repeated && previous) {
          const guess = cell.reaction === "S" ? previous : opposite(previous);
          return opposite(guess);
        }
        return coinToss();
      },
      learn(choice, correct) {
        const key = stateKey();
        const previous = records.length ? records[records.length - 1].actual : null;
        const reaction = previous === null ? null : choice === previous ? "S" : "D";
        if (key !== null) {
          const cell = cells.get(key) || { reaction: null, repeated: false };
          if (cell.reaction === reaction) cell.repeated = true;
          else { cell.reaction = reaction; cell.repeated = false; }
          cells.set(key, cell);
        }
        records.push({ actual: choice, correct });
      },
    };
  },
};

function randomSeed() {
  return (Math.random() * 0x7fffffff) >>> 0;
}

function playVoyage(createStrategy, rules) {
  const predictor = createShannonPredictor({ seed: randomSeed() });
  const player = createStrategy();
  let lives = 3;
  let danger = 0;
  let firstLampLost = null;
  let dangerHits = 0;

  for (let round = 1; round <= rules.total; round += 1) {
    const chainLength = round > rules.stormAt ? rules.stormChain : rules.chain;
    // Strategies see only whether the searchlight is lit, never the direction.
    const choice = player.choose(predictor.predict().trained);

    const record = predictor.observe(choice);
    player.learn(choice, record.correct);

    const next = advanceAdventureDanger(
      { lives, danger },
      { round, trained: record.trained, correct: record.correct },
      { warmup: rules.warmup, chainLength },
    );
    if (next.dangerHit) dangerHits += 1;
    if (next.lifeLost && firstLampLost === null) firstLampLost = round;
    lives = next.lives;
    danger = next.danger;
    if (lives === 0) return { captured: round, lives: 0, firstLampLost, dangerHits };
  }

  return { captured: null, lives, firstLampLost, dangerHits };
}

function playDuel(createStrategy) {
  const predictor = createShannonPredictor({ seed: randomSeed() });
  const player = createStrategy();
  const records = [];
  let machineWins = 0;

  for (let hand = 0; hand < DUEL_TOTAL; hand += 1) {
    const choice = player.choose(predictor.predict().trained);
    const record = predictor.observe(choice);
    player.learn(choice, record.correct);
    if (record.correct) machineWins += 1;
    records.push(record);
  }

  return { machineWins, records };
}

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

function percentile(values, fraction) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function reportVoyage(label, rules) {
  console.log(`\n${label}`);
  console.log(
    "  策略".padEnd(16)
    + "被捕".padStart(8)
    + "3灯".padStart(8)
    + "2灯".padStart(8)
    + "1灯".padStart(8)
    + "0红".padStart(8)
    + "首次掉灯".padStart(10),
  );
  for (const [name, createStrategy] of Object.entries(STRATEGIES)) {
    const lamps = [0, 0, 0, 0];
    const firstLosses = [];
    let captured = 0;
    let zeroRed = 0;
    for (let session = 0; session < SESSIONS; session += 1) {
      const result = playVoyage(createStrategy, rules);
      if (result.captured !== null) captured += 1;
      if (result.captured === null && result.dangerHits === 0) zeroRed += 1;
      lamps[result.lives] += 1;
      if (result.firstLampLost !== null) firstLosses.push(result.firstLampLost);
    }
    const pct = (count) => `${(count / SESSIONS * 100).toFixed(1)}%`;
    console.log(
      `  ${name}`.padEnd(16)
      + pct(captured).padStart(8)
      + pct(lamps[3]).padStart(8)
      + pct(lamps[2]).padStart(8)
      + pct(lamps[1]).padStart(8)
      + pct(zeroRed).padStart(8)
      + String(median(firstLosses) ?? "-").padStart(10),
    );
  }
}

function reportDuel() {
  console.log("\n研究室 64 手 · 机器命中分布与隐藏成就达成率");
  const samples = {};
  for (const [name, createStrategy] of Object.entries(STRATEGIES)) {
    const hits = [];
    const tiers = {};
    let readable = 0;
    for (let session = 0; session < SESSIONS; session += 1) {
      const { machineWins, records } = playDuel(createStrategy);
      hits.push(machineWins);
      const tier = classifyEggScore(DUEL_TOTAL - machineWins, machineWins).tier;
      tiers[tier] = (tiers[tier] || 0) + 1;
      if (summariseShannonVisits(records).mostReadable) readable += 1;
    }
    samples[name] = hits;
    const chosen = ((tiers["shannon-chosen"] || 0) / SESSIONS * 100).toFixed(1);
    const villain = ((tiers["shannon-villain"] || 0) / SESSIONS * 100).toFixed(1);
    console.log(
      `  ${name}`.padEnd(16)
      + `中位 ${String(median(hits)).padStart(2)}`
      + `  p5 ${String(percentile(hits, 0.05)).padStart(2)}`
      + `  p95 ${String(percentile(hits, 0.95)).padStart(2)}`
      + `  破解章 ${chosen.padStart(5)}%`
      + `  观察章 ${villain.padStart(5)}%`
      + `  可读格 ${(readable / SESSIONS * 100).toFixed(1).padStart(5)}%`,
    );
  }

  console.log("\n  若改用绝对阈值（机器命中 <= X 判定破解章）:");
  const names = Object.keys(STRATEGIES);
  console.log("    X  " + names.map((name) => name.padStart(12)).join(""));
  for (const threshold of [15, 18, 20, 21, 22, 24]) {
    const row = names.map((name) => {
      const share = samples[name].filter((value) => value <= threshold).length / SESSIONS;
      return `${(share * 100).toFixed(1)}%`.padStart(12);
    });
    console.log(`   ${String(threshold).padStart(2)}  ${row.join("")}`);
  }
  console.log("\n  参考: 3:1 = 机器<=15（旧线）· 2:1 = 机器<=21（现行）");
}

console.log(`每档 ${SESSIONS} 局`);
reportVoyage("旧配置 150 手 / 热身 30 / 无风暴", {
  total: 150, warmup: 30, chain: 3, stormAt: Infinity, stormChain: 2,
});
reportVoyage("只缩短 100 手 / 热身 10 / 无风暴（会明显变简单）", {
  total: 100, warmup: 10, chain: 3, stormAt: Infinity, stormChain: 2,
});
reportVoyage("现行 100 手 / 热身 10 / 第 80 手起链长 2", {
  total: 100, warmup: 10, chain: 3, stormAt: 80, stormChain: 2,
});
reportDuel();
