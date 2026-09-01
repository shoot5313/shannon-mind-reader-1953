#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { LEFT, RIGHT, createShannonPredictor } = require("../src/engine.js");

const seed = 1953;
const gameUrl = pathToFileURL(path.resolve(__dirname, "..", "index.html")).href;
const pattern = [LEFT, LEFT, RIGHT, RIGHT];
const choices = Array.from({ length: 150 }, (_, index) => pattern[index % pattern.length]);
const direct = createShannonPredictor({ seed });
const directCorrect = choices.filter((choice) => direct.observe(choice).correct).length;

const chrome = spawn("google-chrome", [
  "--headless=new",
  "--no-sandbox",
  "--no-first-run",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-background-networking",
  "--remote-debugging-pipe",
], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });

let id = 0;
let buffer = "";
let stderr = "";
const pending = new Map();
const eventWaiters = [];

chrome.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
chrome.stdio[4].on("data", (chunk) => {
  buffer += chunk.toString();
  const messages = buffer.split("\0");
  buffer = messages.pop();
  for (const raw of messages) {
    if (!raw) continue;
    const message = JSON.parse(raw);
    if (message.id && pending.has(message.id)) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
      continue;
    }
    for (let index = eventWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = eventWaiters[index];
      if (waiter.method === message.method && waiter.sessionId === message.sessionId) {
        eventWaiters.splice(index, 1);
        waiter.resolve(message.params);
      }
    }
  }
});

function send(method, params = {}, sessionId) {
  const messageId = ++id;
  return new Promise((resolve, reject) => {
    pending.set(messageId, { resolve, reject });
    const message = { id: messageId, method, params };
    if (sessionId) message.sessionId = sessionId;
    chrome.stdio[3].write(`${JSON.stringify(message)}\0`);
  });
}

function waitFor(method, sessionId) {
  return new Promise((resolve) => eventWaiters.push({ method, sessionId, resolve }));
}

async function main() {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  const loaded = waitFor("Page.loadEventFired", sessionId);
  await send("Page.navigate", {
    url: `${gameUrl}?pilot=1&pid=DIAG&seed=1953&speed=0&locks=off`,
  }, sessionId);
  await loaded;

  const result = await send("Runtime.evaluate", {
    expression: `new Promise(function(resolve, reject) {
      var pattern = ["L", "L", "R", "R"];
      var deadline = Date.now() + 8000;
      var timer = setInterval(function() {
        var resultNode = document.querySelector(".escape-result");
        if (resultNode) {
          clearInterval(timer);
          var detail = document.querySelector(".result-metric small").textContent;
          var match = detail.match(/(\\d+) \\/ (\\d+)/);
          resolve(JSON.stringify({ correct: Number(match[1]), trials: Number(match[2]) }));
          return;
        }
        if (Date.now() > deadline) {
          clearInterval(timer);
          reject(new Error("browser loop did not finish"));
          return;
        }
        var counter = document.querySelector(".game-counter b");
        if (!counter) return;
        var round = Number(counter.textContent);
        var button = document.querySelector('[data-route-choice="' + pattern[round % 4] + '"]');
        if (button && !button.disabled) button.click();
      }, 2);
    })`,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);

  const browser = JSON.parse(result.result.value);
  assert.equal(browser.trials, choices.length, "browser did not record all choices");
  assert.equal(browser.correct, directCorrect, "browser and direct engine predictions diverged");

  const lossLoaded = waitFor("Page.loadEventFired", sessionId);
  await send("Page.navigate", {
    url: `${gameUrl}?variant=escape-beam&seed=1953&speed=0`,
  }, sessionId);
  await lossLoaded;
  const lossResult = await send("Runtime.evaluate", {
    expression: `new Promise(function(resolve, reject) {
      var deadline = Date.now() + 8000;
      var timer = setInterval(function() {
        var resultNode = document.querySelector(".escape-result");
        if (resultNode) {
          clearInterval(timer);
          resolve(JSON.stringify({
            title: document.querySelector("#resultTitleV2").textContent,
            route: document.querySelector(".result-opening p").textContent
          }));
          return;
        }
        if (Date.now() > deadline) {
          clearInterval(timer);
          reject(new Error("zoned lock route did not finish"));
          return;
        }
        var button = document.querySelector('[data-route-choice="L"]');
        if (button && !button.disabled) button.click();
      }, 2);
    })`,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  const loss = JSON.parse(lossResult.result.value);
  assert.match(loss.title, /封锁完成/);
  assert.match(loss.route, /113/);

  const prizeLoaded = waitFor("Page.loadEventFired", sessionId);
  await send("Page.navigate", {
    url: `${gameUrl}?variant=escape-beam&seed=1953&speed=0`,
  }, sessionId);
  await prizeLoaded;
  const prizeResult = await send("Runtime.evaluate", {
    expression: `new Promise(function(resolve, reject) {
      var mirror = MindReader.createShannonPredictor({ seed: 1953 });
      var records = [];
      var deadline = Date.now() + 8000;
      var timer = setInterval(function() {
        var resultNode = document.querySelector(".escape-result");
        if (resultNode) {
          clearInterval(timer);
          var score = document.querySelector(".result-metric strong").textContent.match(/(\\d+)\\s*:\\s*(\\d+)/);
          resolve(JSON.stringify({
            tag: document.querySelector(".result-header > span").textContent,
            player: Number(score[1]),
            machine: Number(score[2])
          }));
          return;
        }
        if (Date.now() > deadline) {
          clearInterval(timer);
          reject(new Error("3:1 counter-strategy did not finish"));
          return;
        }
        var pending = mirror.predict();
        var previous = records.length ? records[records.length - 1].actual : null;
        var choice;
        if (!previous || pending.state === null) choice = records.length % 2 ? "R" : "L";
        else {
          var cell = pending.cell;
          var reaction = !cell || cell.reaction === null
            ? "S"
            : cell.repeated ? (cell.reaction === "S" ? "D" : "S") : cell.reaction;
          choice = reaction === "S" ? previous : (previous === "L" ? "R" : "L");
        }
        var button = document.querySelector('[data-route-choice="' + choice + '"]');
        if (button && !button.disabled) {
          records.push(mirror.observe(choice));
          button.click();
        }
      }, 2);
    })`,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  const prize = JSON.parse(prizeResult.result.value);
  assert.equal(prize.tag.trim(), "3:1 大奖");
  assert.ok(prize.player > prize.machine * 3, `${prize.player}:${prize.machine} did not clear 3:1`);

  console.log(`PASS: browser and engine agree (${browser.correct}/${browser.trials}); zoned loss ends at 113; counter-strategy earns ${prize.player}:${prize.machine}.`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error.stack}\n${stderr}\n`);
    process.exitCode = 1;
  })
  .finally(() => chrome.kill("SIGTERM"));
