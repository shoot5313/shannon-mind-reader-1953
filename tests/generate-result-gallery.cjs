#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { mkdtempSync } = require("node:fs");
const { mkdir, rm, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const Engine = require("../src/engine.js");

const nickname = "是勿忑";
const projectRoot = path.resolve(__dirname, "..");
const outputRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(projectRoot, "qa", "是勿忑-全结局-20260830");
const cardsRoot = path.join(outputRoot, "cards");
const screensRoot = path.join(outputRoot, "screens");
const indexUrl = pathToFileURL(path.join(projectRoot, "index.html"));
const chromeProfile = mkdtempSync("/tmp/mind-reader-gallery-");

function smartGreeting(label) {
  return `${nickname}，你是香农严选 ${label}，机器还没完全跟上你，你可以用脑洞发电！`;
}

function dumbGreeting(label) {
  return `${nickname}，你是香农严选 ${label}，不过傻人有傻福，你可以用运气发电！`;
}

const duelCases = [
  {
    id: "duel-100-ordinary-32-32",
    title: "100% 普通蛋 · 32:32",
    playerWins: 32,
    machineWins: 32,
    label: "100% 普通蛋",
    greeting: `${nickname}，你是香农严选 100% 普通蛋，和机器打成平手，胜在供电稳定！`,
  },
  {
    id: "duel-100-smart-33-31",
    title: "100% 聪明蛋 · 33:31",
    playerWins: 33,
    machineWins: 31,
    label: "100% 聪明蛋",
    greeting: smartGreeting("100% 聪明蛋"),
  },
  {
    id: "duel-100-smart-38-26",
    title: "100% 聪明蛋 · 38:26",
    playerWins: 38,
    machineWins: 26,
    label: "100% 聪明蛋",
    greeting: smartGreeting("100% 聪明蛋"),
  },
  {
    id: "duel-100-smart-42-22",
    title: "100% 聪明蛋 · 42:22",
    playerWins: 42,
    machineWins: 22,
    label: "100% 聪明蛋",
    greeting: smartGreeting("100% 聪明蛋"),
  },
  {
    id: "duel-100-smart-43-21",
    title: "100% 聪明蛋 · 43:21 · 刚好解锁",
    playerWins: 43,
    machineWins: 21,
    label: "100% 聪明蛋",
    greeting: `${nickname}，恭喜你成为香农严选 100% 聪明蛋，你可以用智力发电！`,
  },
  {
    id: "duel-100-smart-49-15",
    title: "100% 聪明蛋 · 49:15",
    playerWins: 49,
    machineWins: 15,
    label: "100% 聪明蛋",
    greeting: `${nickname}，恭喜你成为香农严选 100% 聪明蛋，你可以用智力发电！`,
  },
  {
    id: "duel-100-dumb-31-33",
    title: "100% 笨蛋 · 31:33",
    playerWins: 31,
    machineWins: 33,
    label: "100% 笨蛋",
    greeting: dumbGreeting("100% 笨蛋"),
  },
  {
    id: "duel-100-dumb-26-38",
    title: "100% 笨蛋 · 26:38",
    playerWins: 26,
    machineWins: 38,
    label: "100% 笨蛋",
    greeting: dumbGreeting("100% 笨蛋"),
  },
  {
    id: "duel-100-dumb-22-42",
    title: "100% 笨蛋 · 22:42",
    playerWins: 22,
    machineWins: 42,
    label: "100% 笨蛋",
    greeting: dumbGreeting("100% 笨蛋"),
  },
  {
    id: "duel-100-bad-21-43",
    title: "100% 大坏蛋 · 21:43 · 刚好解锁",
    playerWins: 21,
    machineWins: 43,
    label: "100% 大坏蛋",
    greeting: `${nickname}，恭喜你成为香农严选 100% 大坏蛋，机器已将你列为重点观察对象，你可以用坏心眼发电！`,
  },
  {
    id: "duel-100-bad-15-49",
    title: "100% 大坏蛋 · 15:49",
    playerWins: 15,
    machineWins: 49,
    label: "100% 大坏蛋",
    greeting: `${nickname}，恭喜你成为香农严选 100% 大坏蛋，机器已将你列为重点观察对象，你可以用坏心眼发电！`,
  },
  {
    id: "duel-100-bad-0-64",
    title: "100% 大坏蛋 · 0:64",
    playerWins: 0,
    machineWins: 64,
    label: "100% 大坏蛋",
    greeting: `${nickname}，恭喜你成为香农严选 100% 大坏蛋，机器已将你列为重点观察对象，你可以用坏心眼发电！`,
  },
];

const adventureCases = [
  {
    id: "adventure-treasure-ember-coins",
    title: "余烬金币 · 1 盏命灯",
    strategy: "treasure-1",
    outcome: "treasure",
    round: 100,
    lives: 1,
    treasureName: "余烬金币",
    treasureMeta: "回收级 · 图鉴稀有度 1 / 3",
    greeting: `${nickname}，只剩最后一盏命灯，你还是把余烬金币带了回来。`,
  },
  {
    id: "adventure-treasure-relay-compass",
    title: "继电罗盘 · 2 盏命灯",
    strategy: "treasure-2",
    outcome: "treasure",
    round: 100,
    lives: 2,
    treasureName: "继电罗盘",
    treasureMeta: "稀有级 · 图鉴稀有度 2 / 3",
    greeting: `${nickname}，机器只熄灭一盏灯，继电罗盘归你。`,
  },
  {
    id: "adventure-treasure-shannon-key",
    title: "香农密钥 · 3 盏命灯",
    strategy: "treasure-3",
    outcome: "treasure",
    round: 100,
    lives: 3,
    treasureName: "香农密钥",
    treasureMeta: "绝密级 · 图鉴稀有度 3 / 3",
    greeting: `${nickname}，三盏命灯全部亮着，香农密钥归你。`,
  },
  {
    id: "adventure-captured-19",
    title: "寻宝失败 · 第 19 海里被捕",
    strategy: "caught",
    outcome: "captured",
    round: 19,
    greeting: `${nickname}，你在第 19 海里被香农逮住了，宝藏还在前面，不过你可以用不服气发电！`,
  },
];

const chrome = spawn("google-chrome", [
  "--headless=new",
  "--no-sandbox",
  "--no-first-run",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-breakpad",
  "--disable-crash-reporter",
  "--disable-background-networking",
  "--hide-scrollbars",
  `--user-data-dir=${chromeProfile}`,
  "--remote-debugging-pipe",
], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });

let nextId = 0;
let protocolBuffer = "";
let chromeStderr = "";
const pending = new Map();
const eventWaiters = [];

chrome.stderr.on("data", (chunk) => { chromeStderr += chunk.toString(); });
chrome.on("exit", (code, signal) => {
  const error = new Error(`Chrome exited before QA completed (code ${code}, signal ${signal})`);
  for (const waiter of pending.values()) waiter.reject(error);
  pending.clear();
  for (const waiter of eventWaiters.splice(0)) waiter.reject?.(error);
});
chrome.stdio[3].on("error", (error) => {
  chromeStderr += `\nprotocol write pipe: ${error.stack || error.message}\n`;
});
chrome.stdio[4].on("error", (error) => {
  chromeStderr += `\nprotocol read pipe: ${error.stack || error.message}\n`;
});
chrome.stdio[4].on("data", (chunk) => {
  protocolBuffer += chunk.toString();
  const messages = protocolBuffer.split("\0");
  protocolBuffer = messages.pop();
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
  const id = ++nextId;
  const message = { id, method, params };
  if (sessionId) message.sessionId = sessionId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    chrome.stdio[3].write(`${JSON.stringify(message)}\0`);
  });
}

function waitFor(method, sessionId) {
  return new Promise((resolve) => eventWaiters.push({ method, sessionId, resolve }));
}

function pageUrl(variant) {
  const url = new URL(indexUrl);
  url.searchParams.set("variant", variant);
  url.searchParams.set("name", nickname);
  url.searchParams.set("shell", "1");
  url.searchParams.set("start", "1");
  url.searchParams.set("seed", "1953");
  url.searchParams.set("speed", "0");
  url.searchParams.set("qa", "1");
  return url.href;
}

async function evaluate(sessionId, expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || "browser evaluation failed");
  }
  return result.result?.value;
}

async function navigate(sessionId, url) {
  const loaded = waitFor("Page.loadEventFired", sessionId);
  await send("Page.navigate", { url }, sessionId);
  await loaded;
  await evaluate(sessionId, "document.fonts ? document.fonts.ready.then(function(){return true;}) : true");
}

function driveDuelExpression(machineWins) {
  return `new Promise(function(resolve, reject) {
    var deadline = Date.now() + 12000;
    var timer = setInterval(function() {
      var api = window.__twoModePrototype;
      if (!api) return;
      var state = api.getState();
      if (state.screen === "result") {
        clearInterval(timer);
        resolve({
          playerWins: state.result.playerWins,
          machineWins: state.result.machineWins,
          visitTotal: state.result.visitProfile.total,
          visitCounts: state.result.visitProfile.entries.map(function(entry) { return entry.count; }),
          visitBars: document.querySelectorAll(".visit-spectrum > span").length,
          visitSummary: document.querySelector(".visit-profile > p").textContent.replace(/\\s+/g, " ").trim(),
          label: document.querySelector(".egg-card h1").textContent.trim(),
          greeting: document.querySelector(".egg-card h2").textContent.trim(),
          hasResultDisclaimer: Boolean(document.querySelector(".duel-result .duel-disclaimer")),
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: innerWidth,
          scrollHeight: document.documentElement.scrollHeight,
          innerHeight: innerHeight
        });
        return;
      }
      if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error("duel simulation timed out"));
        return;
      }
      if (!state.locked) {
        var prediction = state.pending.choice;
        var choice = state.records.length < ${machineWins}
          ? prediction
          : prediction === "L" ? "R" : "L";
        api.choose(choice);
      }
    }, 1);
  })`;
}

function driveAdventureExpression(strategy) {
  const chooseCaught = strategy === "caught";
  const targetLives = strategy === "treasure-1" ? 1 : strategy === "treasure-2" ? 2 : 3;
  return `new Promise(function(resolve, reject) {
    var deadline = Date.now() + 12000;
    var timer = setInterval(function() {
      var api = window.__twoModePrototype;
      if (!api) return;
      var state = api.getState();
      if (state.screen === "result") {
        clearInterval(timer);
        var greetingNode = document.querySelector(".captured-copy span, .treasure-copy span");
        resolve({
          outcome: state.result.outcome,
          round: state.result.round,
          lives: state.result.lives === undefined ? 0 : state.result.lives,
          greeting: greetingNode.textContent.trim(),
          treasureName: document.querySelector(".treasure-copy h1") ? document.querySelector(".treasure-copy h1").textContent.trim() : "",
          treasureMeta: document.querySelector(".treasure-copy p") ? document.querySelector(".treasure-copy p").textContent.trim() : "",
          archiveClue: document.querySelector('[data-action="research"]').textContent.replace(/\s+/g, " ").trim(),
          primaryActionCount: document.querySelectorAll(".result-action-row--adventure button").length,
          hasProminentResearchButton: Boolean(document.querySelector(".research-room-button")),
          dockStatus: document.querySelector(".product-dock__seal small").textContent.trim(),
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: innerWidth,
          scrollHeight: document.documentElement.scrollHeight,
          innerHeight: innerHeight
        });
        return;
      }
      if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error("adventure simulation timed out"));
        return;
      }
      if (!state.locked) {
        var prediction = state.pending.choice;
        var choice = ${chooseCaught ? "prediction" : `state.lives > ${targetLives} ? prediction : (prediction === "L" ? "R" : "L")`};
        api.choose(choice);
      }
    }, 1);
  })`;
}

async function saveViewport(sessionId, target) {
  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  }, sessionId);
  await writeFile(target, Buffer.from(screenshot.data, "base64"));
}

async function saveShareCard(sessionId, target) {
  const payload = await evaluate(sessionId, `new Promise(function(resolve, reject) {
    var button = document.querySelector('[data-action="share"]');
    if (!button) { reject(new Error("share button missing")); return; }
    button.click();
    setTimeout(function() {
      var image = document.querySelector(".share-card-modal img");
      if (!image) { reject(new Error("share image missing")); return; }
      resolve({ src: image.src, width: image.naturalWidth, height: image.naturalHeight });
    }, 40);
  })`);
  assert.equal(payload.width, 1080, "share card width");
  assert.equal(payload.height, 1440, "share card height");
  assert.match(payload.src, /^data:image\/png;base64,/);
  const png = Buffer.from(payload.src.slice(payload.src.indexOf(",") + 1), "base64");
  assert.equal(png.toString("ascii", 1, 4), "PNG", "share card PNG signature");
  assert.equal(png.readUInt32BE(16), 1080, "PNG IHDR width");
  assert.equal(png.readUInt32BE(20), 1440, "PNG IHDR height");
  assert.ok(png.length > 20000, `share card unexpectedly small: ${png.length} bytes`);
  await writeFile(target, png);
  return {
    width: payload.width,
    height: payload.height,
    bytes: png.length,
    sha256: crypto.createHash("sha256").update(png).digest("hex"),
  };
}

async function assertNativeSaveBridge(sessionId) {
  const actual = await evaluate(sessionId, `new Promise(function(resolve, reject) {
    var calls = [];
    window.xhs = {
      miniTool: {
        writeTempFile: function(options) {
          calls.push({ api: "writeTempFile", keys: Object.keys(options), data: options.data });
          return Promise.resolve({ filePath: "xhs-temp://shannon-result.png" });
        },
        saveImageToPhotosAlbum: function(options) {
          calls.push({ api: "saveImageToPhotosAlbum", keys: Object.keys(options), filePath: options.filePath });
          return Promise.resolve({ errMsg: "saveImageToPhotosAlbum:ok" });
        }
      }
    };
    var button = document.querySelector("[data-save-share]");
    if (!button) { reject(new Error("save-to-album button missing")); return; }
    button.click();
    setTimeout(function() {
      resolve({
        calls: calls,
        status: document.querySelector("[data-save-status]").textContent.trim()
      });
    }, 80);
  })`);

  assert.equal(actual.status, "已保存到系统相册。");
  assert.equal(actual.calls.length, 2);
  assert.deepEqual(actual.calls[0].keys, ["data"]);
  assert.match(actual.calls[0].data, /^data:image\/png;base64,/);
  assert.ok(actual.calls[0].data.length > 20000, "bridge received a truncated PNG data URI");
  assert.deepEqual(actual.calls[1], {
    api: "saveImageToPhotosAlbum",
    keys: ["filePath"],
    filePath: "xhs-temp://shannon-result.png",
  });
}

function assertViewport(actual) {
  assert.equal(actual.scrollWidth, actual.innerWidth, "horizontal overflow");
  assert.equal(actual.scrollHeight, actual.innerHeight, "result must fit one mobile screen");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function markdownCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function galleryHtml(results) {
  const passed = results.filter((result) => result.pass).length;
  const cards = results.map((result) => `
    <article class="case ${result.pass ? "pass" : "fail"}">
      <header><span>${result.pass ? "PASS" : "FAIL"}</span><h2>${escapeHtml(result.title)}</h2></header>
      ${result.pass ? `<a href="${escapeHtml(result.card)}"><img src="${escapeHtml(result.card)}" alt="${escapeHtml(result.title)}结果卡"></a>` : ""}
      <dl>
        <div><dt>结果</dt><dd>${escapeHtml(result.actualLabel || result.actualOutcome || "—")}</dd></div>
        <div><dt>文案</dt><dd>${escapeHtml(result.actualGreeting || result.error || "—")}</dd></div>
        ${result.score ? `<div><dt>比分</dt><dd>${escapeHtml(result.score)}</dd></div>` : ""}
        ${result.pass ? `<div><dt>PNG</dt><dd>${result.width}×${result.height} · ${Math.round(result.bytes / 1024)} KB</dd></div>` : ""}
      </dl>
      ${result.pass ? `<footer><a href="${escapeHtml(result.screen)}">查看手机结算截图</a><code>${result.sha256.slice(0, 12)}</code></footer>` : ""}
    </article>
  `).join("");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${nickname} · 香农全结局 QA</title>
<style>
:root{color-scheme:dark;font-family:ui-monospace,SFMono-Regular,Consolas,"PingFang SC",sans-serif;background:#07110d;color:#d9ead4}*{box-sizing:border-box}body{margin:0;background:linear-gradient(rgba(55,255,147,.025) 1px,transparent 1px),#07110d;background-size:100% 4px}main{width:min(1500px,94vw);margin:auto;padding:48px 0 80px}h1{font-family:Georgia,"Songti SC",serif;font-size:clamp(32px,6vw,72px);margin:.15em 0}.lead{color:#8eb59c;max-width:760px;line-height:1.75}.summary{display:inline-flex;gap:18px;border:1px solid #53e28c;padding:10px 14px;margin:12px 0 34px}.summary b{color:#ffcd6b}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:22px}.case{border:1px solid #325f47;background:#0b1812;padding:14px;box-shadow:8px 8px 0 #030a07}.case.fail{border-color:#ff675f}.case header span{font-size:11px;letter-spacing:.18em;color:#53e28c}.case.fail header span{color:#ff675f}.case h2{font-size:17px;min-height:42px;margin:8px 0 12px}.case img{display:block;width:100%;aspect-ratio:3/4;object-fit:cover;background:#111;border:1px solid #49624f}.case dl{font-family:"PingFang SC",sans-serif;font-size:13px;line-height:1.55}.case dl div{display:grid;grid-template-columns:44px 1fr;gap:7px;margin:8px 0}.case dt{color:#769481}.case dd{margin:0}.case footer{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #294334;padding-top:10px;font-size:11px}.case a{color:#70f0a6}.case code{color:#768b7d}small{color:#617a69}</style></head>
<body><main><p>OFFLINE QA / BELL LABS 1953</p><h1>“${nickname}”全结局测试</h1><p class="lead">所有局均由真实前端循环在 390×844 手机视口完成。结果卡由产品自己的 Canvas 代码生成，没有拼接假图。</p><div class="summary"><span>${passed}/${results.length} 通过</span><b>${results.every((result) => result.pass) ? "ALL GREEN" : "CHECK FAILURES"}</b></div><section class="grid">${cards}</section><p><small>生成时间：${new Date().toISOString()} · seed 1953 · 完全离线</small></p></main></body></html>`;
}

async function main() {
  await mkdir(cardsRoot, { recursive: true });
  await mkdir(screensRoot, { recursive: true });

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  }, sessionId);
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);

  const hubUrl = new URL(indexUrl);
  hubUrl.searchParams.set("variant", "hub");
  hubUrl.searchParams.set("seed", "1953");
  hubUrl.searchParams.set("speed", "0");
  await navigate(sessionId, hubUrl.href);
  const entryFlow = await evaluate(sessionId, `(() => {
    const input = document.querySelector("#callsignInput");
    input.value = "";
    document.querySelector('[data-launch="adventure"]').click();
    return {
      adventureStarted: Boolean(document.querySelector(".adventure-game")),
      nickname: new URL(location.href).searchParams.get("name"),
      modeSwitches: document.querySelectorAll("[data-switch]").length
    };
  })()`);
  assert.equal(entryFlow.adventureStarted, true, "home must launch straight into adventure");
  assert.equal(entryFlow.nickname, "匿名船长", "nickname is optional");
  assert.equal(entryFlow.modeSwitches, 0, "active play must not expose a mode switch");

  const results = [];
  for (const testCase of duelCases) {
    const result = { id: testCase.id, title: testCase.title, kind: "duel", pass: false };
    try {
      await navigate(sessionId, pageUrl("duel"));
      const actual = await evaluate(sessionId, driveDuelExpression(testCase.machineWins));
      assert.equal(actual.playerWins, testCase.playerWins);
      assert.equal(actual.machineWins, testCase.machineWins);
      assert.equal(actual.label, testCase.label);
      assert.equal(actual.greeting, testCase.greeting);
      assert.equal(actual.visitTotal, 62, "64 hands must produce 62 valid cell visits");
      assert.equal(actual.visitBars, 8, "result must show all eight cell visit bars");
      assert.equal(actual.visitCounts.reduce((sum, count) => sum + count, 0), 62);
      assert.match(actual.visitSummary, /最常进入/);
      assert.match(actual.visitSummary, /最少进入/);
      assert.equal(actual.hasResultDisclaimer, false);
      assertViewport(actual);

      const cardName = `cards/${testCase.id}.png`;
      const screenName = `screens/${testCase.id}-mobile.png`;
      await saveViewport(sessionId, path.join(outputRoot, screenName));
      const card = await saveShareCard(sessionId, path.join(outputRoot, cardName));
      if (testCase === duelCases[0]) await assertNativeSaveBridge(sessionId);
      Object.assign(result, card, {
        pass: true,
        card: cardName,
        screen: screenName,
        score: `${actual.playerWins}:${actual.machineWins}`,
        actualLabel: actual.label,
        actualGreeting: actual.greeting,
      });
    } catch (error) {
      result.error = error.stack || error.message;
    }
    results.push(result);
    process.stdout.write(`${result.pass ? "PASS" : "FAIL"} ${testCase.title}\n`);
  }

  for (const testCase of adventureCases) {
    const result = { id: testCase.id, title: testCase.title, kind: "adventure", pass: false };
    try {
      await navigate(sessionId, pageUrl("adventure"));
      const actual = await evaluate(sessionId, driveAdventureExpression(testCase.strategy));
      assert.equal(actual.outcome, testCase.outcome);
      assert.equal(actual.round, testCase.round);
      if (testCase.lives !== undefined) assert.equal(actual.lives, testCase.lives);
      assert.equal(actual.greeting, testCase.greeting);
      if (testCase.treasureName) assert.equal(actual.treasureName, testCase.treasureName);
      if (testCase.treasureMeta) assert.equal(actual.treasureMeta, testCase.treasureMeta);
      assert.match(actual.archiveClue, /CASE 8/);
      assert.doesNotMatch(actual.archiveClue, /八格研究室/);
      assert.equal(actual.primaryActionCount, 2);
      assert.equal(actual.hasProminentResearchButton, false);
      assert.equal(actual.dockStatus, "航迹只在本机");
      assertViewport(actual);

      const cardName = `cards/${testCase.id}.png`;
      const screenName = `screens/${testCase.id}-mobile.png`;
      await saveViewport(sessionId, path.join(outputRoot, screenName));
      const card = await saveShareCard(sessionId, path.join(outputRoot, cardName));
      const transition = await evaluate(sessionId, `(() => {
        document.querySelector('[data-close-share]')?.click();
        document.querySelector('[data-action="research"]').click();
        return {
          opened: Boolean(document.querySelector(".duel-brief")),
          title: document.querySelector(".product-dock strong")?.textContent.trim(),
          modeSwitches: document.querySelectorAll("[data-switch]").length
        };
      })()`);
      assert.equal(transition.opened, true, "adventure result must open the research room");
      assert.equal(transition.title, "B / 八格研究室");
      assert.equal(transition.modeSwitches, 0, "research room must not expose a mode switch");
      Object.assign(result, card, {
        pass: true,
        card: cardName,
        screen: screenName,
        score: testCase.outcome === "captured" ? `第 ${actual.round} 海里` : `${actual.round} 海里 / ${actual.lives} 盏命灯`,
        actualOutcome: actual.outcome,
        actualGreeting: actual.greeting,
      });
    } catch (error) {
      result.error = error.stack || error.message;
    }
    results.push(result);
    process.stdout.write(`${result.pass ? "PASS" : "FAIL"} ${testCase.title}\n`);
  }

  const passed = results.filter((result) => result.pass).length;
  const reportRows = results.map((result) => [
    result.pass ? "PASS" : "FAIL",
    result.title,
    result.actualLabel || result.actualOutcome || "—",
    result.score || "—",
    result.actualGreeting || result.error || "—",
    result.card || "—",
  ].map(markdownCell).join(" | "));
  const report = `# ${nickname} · 香农全结局 QA\n\n` +
    `- 结果：${passed}/${results.length} 通过\n` +
    `- 环境：390×844 CSS px，deviceScaleFactor 2，seed 1953\n` +
    `- 卡片：每张均验证为 1080×1440 PNG，并记录 SHA-256\n` +
    `- 执行：真实页面状态循环；预测先封存，再按指定胜负路径选择\n\n` +
    `| 状态 | 用例 | 实际结果 | 比分/航程 | 实际文案 | 结果卡 |\n|---|---|---|---|---|---|\n` +
    `${reportRows.join("\n")}\n\n` +
    `## 已覆盖边界\n\n` +
    `- 32:32 的 100% 普通蛋\n- 33:31 的 100% 聪明蛋与 31:33 的 100% 笨蛋\n` +
    `- 48:16 与 16:48 恰好 3:1，不提前触发隐藏成就\n` +
    `- 49:15 的 100% 聪明蛋，以及 15:49 的 100% 大坏蛋\n` +
    `- 0:64 极端大坏蛋\n- 100 海里宝藏与第 19 海里最早截获路径\n`;

  await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify({
    nickname,
    generatedAt: new Date().toISOString(),
    viewport: { width: 390, height: 844, deviceScaleFactor: 2 },
    cardSize: { width: 1080, height: 1440 },
    seed: 1953,
    passed,
    total: results.length,
    results,
  }, null, 2)}\n`);
  await writeFile(path.join(outputRoot, "REPORT.md"), report);
  await writeFile(path.join(outputRoot, "index.html"), galleryHtml(results));
  await writeFile(path.join(outputRoot, "RUN.log"), `${results.map((result) => `${result.pass ? "PASS" : "FAIL"} ${result.title}${result.error ? `\n${result.error}` : ""}`).join("\n")}\n\n${passed}/${results.length} passed\n`);

  if (passed !== results.length) {
    throw new Error(`${results.length - passed} gallery cases failed; inspect ${outputRoot}`);
  }
  process.stdout.write(`ALL GREEN ${passed}/${results.length}\n${outputRoot}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error.stack}\n${chromeStderr}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (chrome.exitCode === null && chrome.signalCode === null) {
      chrome.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => chrome.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
    }
    await rm(chromeProfile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    }).catch(() => {});
  });
