#!/usr/bin/env node

"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const captureScript = path.join(__dirname, "capture-mobile.cjs");
const entry = pathToFileURL(path.join(root, "index.html"));

function runCapture(url, output, action) {
  const result = spawnSync(process.execPath, [
    captureScript,
    url.href,
    output,
    "390",
    "844",
    action,
  ], {
    cwd: root,
    encoding: "utf8",
    timeout: 15000,
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    process.stderr.write(`capture process failed: status=${result.status} signal=${result.signal || "none"}${result.error ? ` error=${result.error.stack || result.error.message}` : ""}\n`);
    process.exit(result.status || 1);
  }
  process.stdout.write(result.stdout);
}

function checkMode(mode, selector) {
  const url = new URL(entry);
  url.searchParams.set("variant", mode);
  url.searchParams.set("name", "反馈测试");
  url.searchParams.set("shell", "1");
  url.searchParams.set("start", "1");
  url.searchParams.set("seed", "1953");
  url.searchParams.set("qa", "1");

  const action = `new Promise(function(resolve, reject) {
    var api = window.__twoModePrototype;
    if (!api) { reject(new Error("missing QA hook")); return; }
    api.choose("L");
    setTimeout(function() {
      var node = document.querySelector(${JSON.stringify(selector)});
      var feedback = node ? node.textContent.replace(/\\s+/g, " ").trim() : "";
      var state = api.getState();
      if (!/它押(左|右)/.test(feedback) || !feedback.includes("你走左")) {
        reject(new Error(${JSON.stringify(mode)} + " result vanished before the next choice: " + feedback));
        return;
      }
      if (state.locked) {
        reject(new Error(${JSON.stringify(mode)} + " controls still locked after 550ms"));
        return;
      }
      if (${JSON.stringify(mode)} === "adventure") {
        var coneOpacity = Number(getComputedStyle(document.querySelector(".search-cone")).opacity);
        if (coneOpacity <= 0.01) {
          reject(new Error("search beam did not appear after the first choice"));
          return;
        }
      }
      resolve({ mode: ${JSON.stringify(mode)}, feedback: feedback, locked: state.locked });
    }, 550);
  })`;

  runCapture(url, `/tmp/shannon-${mode}-feedback.png`, action);
}

function checkInitialBeamIsHidden() {
  const url = new URL(entry);
  url.searchParams.set("variant", "adventure");
  url.searchParams.set("name", "初始光束测试");
  url.searchParams.set("shell", "1");
  url.searchParams.set("start", "1");
  url.searchParams.set("seed", "1953");
  url.searchParams.set("qa", "1");
  const action = `(() => {
    var state = window.__twoModePrototype.getState();
    var cone = document.querySelector(".search-cone");
    var arena = document.querySelector(".sea-arena");
    var style = getComputedStyle(cone);
    var visible = style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.01;
    if (state.records.length !== 0) throw new Error("initial beam check ran after a choice");
    if (visible) throw new Error("search beam is visible before the first choice: opacity=" + style.opacity);
    if (!arena.classList.contains("sea-calm")) throw new Error("voyage did not begin in calm water");
    return { records: state.records.length, weather: "sea-calm", opacity: style.opacity, visibility: style.visibility };
  })()`;
  runCapture(url, "/tmp/shannon-initial-beam.png", action);
}

function checkAdventureBrief() {
  const url = new URL(entry);
  url.searchParams.set("variant", "adventure");
  url.searchParams.set("name", "反馈测试");
  url.searchParams.set("shell", "1");
  url.searchParams.set("qa", "1");
  const action = `(() => {
    var text = document.querySelector(".adventure-brief").textContent.replace(/\\s+/g, " ").trim();
    var required = ["先暗押一条路", "你再选左或右", "押中会照到你", "押错你就躲开", "风平浪静", "风浪中红光连中掉命", "此后大浪滔天", "灯亮，说明它认得这个局面"];
    required.forEach(function(copy) {
      if (!text.includes(copy)) throw new Error("brief is missing: " + copy);
    });
    if (text.includes("调用已学会") || text.includes("灰色“擦过”")) {
      throw new Error("brief still exposes internal machine jargon");
    }
    return { brief: text };
  })()`;
  runCapture(url, "/tmp/shannon-adventure-brief.png", action);
}

function checkDirectCase8Entry() {
  const url = new URL(entry);
  url.searchParams.set("variant", "hub");
  const action = `(() => {
    var input = document.querySelector("#callsignInput");
    var button = document.querySelector('[data-launch="duel"]');
    if (!input || !button) throw new Error("missing direct CASE 8 entrance");
    var label = button.textContent.replace(/\\s+/g, " ").trim();
    ["CASE 8", "直接研究八格机器", "64 手", "攻略封存"].forEach(function(copy) {
      if (!label.includes(copy)) throw new Error("CASE 8 entrance is missing: " + copy);
    });
    input.value = "研究员";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    button.click();
    var params = new URL(location.href).searchParams;
    var room = document.querySelector(".duel-game");
    var counter = room && room.querySelector(".lab-header b");
    if (!room || !counter) throw new Error("direct CASE 8 entrance did not launch the room");
    if (counter.textContent.replace(/\\s+/g, " ").trim() !== "00 / 64") throw new Error("direct CASE 8 run did not start cleanly");
    if (params.get("variant") !== "duel" || params.get("name") !== "研究员") throw new Error("CASE 8 route lost its identity");
    return { label: label, counter: counter.textContent.trim(), nickname: params.get("name") };
  })()`;
  runCapture(url, "/tmp/shannon-direct-case8-entry.png", action);
}

function checkCollectionCabinet() {
  const url = new URL(entry);
  url.searchParams.set("variant", "hub");
  const action = `(() => {
    var miniTool = window.ShannonMiniTool;
    var collection = miniTool && miniTool.collection;
    if (!collection) throw new Error("missing collection store");
    collection.reset();
    var update = collection.recordAdventure({ distance: 100, lives: 3, dangerHits: 8 });
    if (update.newUnlocks.join(",") !== "ember-coins,relay-compass,shannon-key") {
      throw new Error("a three-lamp voyage did not cumulatively recover three treasures");
    }
    if (update.snapshot.items.find(function(item) { return item.id === "question-manuscript"; }).response.level !== 2) {
      throw new Error("the manuscript did not respond to the best complete voyage");
    }
    if (window.MindReader.createCollectionStore(window.localStorage).snapshot().count !== 3) {
      throw new Error("collection did not survive reopening its local store");
    }
    miniTool.showHub();

    var entryButton = document.querySelector(".collection-entry[data-collection]");
    if (!entryButton) throw new Error("the lobby has no cabinet entrance");
    if (entryButton.querySelector("[data-collection-count]").textContent.trim() !== "3") {
      throw new Error("the lobby did not restore collection progress");
    }
    if (entryButton.querySelectorAll("[data-collection-relay].is-on").length !== 3) {
      throw new Error("the lobby relay lamps do not match collection progress");
    }
    entryButton.click();

    var modal = document.querySelector(".collection-cabinet-modal");
    var text = modal ? modal.textContent.replace(/\\s+/g, " ").trim() : "";
    if (!modal || document.querySelectorAll(".cabinet-slot").length !== 6) {
      throw new Error("the cabinet does not expose all six slots");
    }
    ["余烬金币", "继电罗盘", "香农密钥", "问号原稿", "香农破解章", "重点观察章"].forEach(function(name) {
      if (!text.includes(name)) throw new Error("cabinet is missing " + name);
    });
    if (!text.includes("信号正在成形") || !text.includes("昵称、完整路线与逐手选择不会写入档案柜")) {
      throw new Error("cabinet is missing its progressive response or privacy boundary");
    }
    var manuscript = modal.querySelector('[data-collection-item="question-manuscript"]');
    if (!manuscript.classList.contains("response-level-2") || manuscript.querySelectorAll(".cabinet-response__contacts .is-on").length !== 2) {
      throw new Error("the manuscript slot does not show two physical response contacts");
    }
    var manuscriptInspect = manuscript.querySelector("[data-inspect-collection]");
    manuscriptInspect.click();
    var drawer = modal.querySelector("[data-evidence-drawer]");
    var drawerText = drawer.textContent.replace(/\\s+/g, " ").trim();
    if (drawer.hidden || !drawerText.includes("本机最少红光 8 次") || !drawerText.includes("信号正在成形")) {
      throw new Error("the evidence drawer lost the anonymous local best");
    }
    drawer.querySelector("[data-close-evidence]").click();
    if (document.activeElement !== manuscriptInspect) {
      throw new Error("closing the evidence drawer did not return focus to its archive slot");
    }

    var reset = modal.querySelector("[data-reset-collection]");
    reset.click();
    if (collection.snapshot().count !== 3 || !reset.textContent.includes("再次点击")) {
      throw new Error("collection reset skipped confirmation");
    }
    reset.click();
    if (collection.snapshot().count !== 0) throw new Error("collection reset failed");
    var lockedManuscript = modal.querySelector('[data-collection-item="question-manuscript"]');
    lockedManuscript.querySelector("[data-inspect-collection]").click();
    var lockedEvidence = modal.querySelector("[data-evidence-drawer]").textContent.replace(/\s+/g, " ").trim();
    if (lockedEvidence.includes("红光锁定 0 次") || !lockedEvidence.includes("先留下完整航迹")) {
      throw new Error("the locked manuscript disclosed its exact trigger: " + lockedEvidence);
    }
    return { slots: 6, beforeReset: 3, response: 2, afterReset: 0, modalText: text };
  })()`;
  runCapture(url, "/tmp/shannon-collection-cabinet.png", action);
}

function checkFirstPerfectVoyageArchive() {
  const url = new URL(entry);
  url.searchParams.set("variant", "adventure");
  url.searchParams.set("name", "零红光测试");
  url.searchParams.set("shell", "1");
  url.searchParams.set("start", "1");
  url.searchParams.set("seed", "1953");
  url.searchParams.set("qa", "1");
  url.searchParams.set("speed", "0");
  const action = `new Promise(function(resolve, reject) {
    var api = window.__twoModePrototype;
    window.ShannonMiniTool.collection.reset();
    var deadline = Date.now() + 8000;
    function step() {
      if (Date.now() > deadline) { reject(new Error("perfect voyage archive check timed out")); return; }
      var state = api.getState();
      if (state.screen === "result") {
        var receipt = document.querySelector(".result-collection");
        var receiptText = receipt ? receipt.textContent.replace(/\\s+/g, " ").trim() : "";
        if (!state.result.treasure || state.result.treasure.id !== "question-manuscript" || state.result.dangerHits !== 0) {
          reject(new Error("zero-red voyage did not reveal the question manuscript"));
          return;
        }
        if (state.newUnlocks.length !== 4 || !receiptText.includes("本次补录 4 件") || !receiptText.includes("问号原稿")) {
          reject(new Error("first perfect voyage did not cumulatively file all four treasures: " + receiptText));
          return;
        }
        if (document.documentElement.scrollWidth > innerWidth) {
          reject(new Error("four-item archive receipt overflows the mobile viewport"));
          return;
        }
        resolve({ treasure: state.result.treasure.name, newUnlocks: state.newUnlocks, receipt: receiptText });
        return;
      }
      if (!state.locked) {
        api.choose(state.pending.choice === "L" ? "R" : "L");
      }
      setTimeout(step, 0);
    }
    step();
  })`;
  runCapture(url, "/tmp/shannon-first-perfect-voyage.png", action);
}

function checkCompletedArchiveCertificate() {
  const url = new URL(entry);
  url.searchParams.set("variant", "hub");
  const action = `new Promise(function(resolve, reject) {
    var miniTool = window.ShannonMiniTool;
    var collection = miniTool.collection;
    collection.reset();
    collection.recordAdventure({ distance: 100, lives: 3, dangerHits: 0 });
    collection.recordDuel({ playerWins: 43, machineWins: 21 });
    var finalUpdate = collection.recordDuel({ playerWins: 21, machineWins: 43 });
    if (!finalUpdate.completedNow || !finalUpdate.snapshot.complete || finalUpdate.snapshot.count !== 6) {
      reject(new Error("the sixth artifact did not complete the total archive"));
      return;
    }
    miniTool.showHub();
    document.querySelector("[data-collection]").click();
    var cabinet = document.querySelector(".collection-cabinet");
    var completion = cabinet && cabinet.querySelector(".collection-completion");
    if (!completion || !cabinet.classList.contains("is-complete")) {
      reject(new Error("the 6/6 cabinet has no final archive panel"));
      return;
    }
    completion.querySelector("[data-collection-certificate]").click();
    setTimeout(function() {
      var modal = document.querySelector(".collection-certificate-modal");
      var image = modal && modal.querySelector("img");
      if (!modal || !image || image.naturalWidth !== 1080 || image.naturalHeight !== 1440 || !/^data:image\\/png;base64,/.test(image.src)) {
        reject(new Error("the final archive certificate is missing or malformed"));
        return;
      }
      resolve({ count: 6, width: image.naturalWidth, height: image.naturalHeight });
    }, 80);
  })`;
  runCapture(url, "/tmp/shannon-complete-archive.png", action);
}

function checkQuickRelayPreference() {
  const url = new URL(entry);
  url.searchParams.set("variant", "adventure");
  url.searchParams.set("name", "复航测试");
  url.searchParams.set("shell", "1");
  url.searchParams.set("start", "1");
  url.searchParams.set("seed", "1953");
  url.searchParams.set("qa", "1");
  const action = `(() => {
    var api = window.__twoModePrototype;
    var collection = window.ShannonMiniTool.collection;
    collection.reset();
    collection.recordAdventure({ distance: 19, lives: 0, dangerHits: 3 });
    api.restart();
    var speed = document.querySelector('[data-action="toggle-speed"]');
    if (!speed || !speed.textContent.includes("标准")) throw new Error("returning players cannot find relay speed");
    speed.click();
    if (!api.getState().quickMode || !collection.snapshot().preferences.quickAdventure) {
      throw new Error("quick relay preference was not stored");
    }
    api.restart();
    speed = document.querySelector('[data-action="toggle-speed"]');
    if (!api.getState().quickMode || !speed || !speed.textContent.includes("快速")) {
      throw new Error("quick relay preference did not survive a retry");
    }
    return { availableAfterRun: true, quick: api.getState().quickMode };
  })()`;
  runCapture(url, "/tmp/shannon-quick-relay.png", action);
}

function checkAdventureMilestones() {
  const url = new URL(entry);
  url.searchParams.set("variant", "adventure");
  url.searchParams.set("name", "反馈测试");
  url.searchParams.set("shell", "1");
  url.searchParams.set("start", "1");
  url.searchParams.set("seed", "1953");
  url.searchParams.set("qa", "1");
  url.searchParams.set("speed", "0");
  const action = `new Promise(function(resolve, reject) {
    var api = window.__twoModePrototype;
    var expected = {
      10: ["波涛汹涌", "风浪骤起", "sea-rough"],
      40: ["波涛汹涌", "穿过第一阵风浪", "sea-rough"],
      60: ["波涛汹涌", "驶入深水风暴", "sea-rough"],
      80: ["大浪滔天", "连中两次红光就掉一盏灯", "sea-tempest"]
    };
    var found = {};
    var deadline = Date.now() + 8000;
    function step() {
      if (Date.now() > deadline) { reject(new Error("milestone check timed out")); return; }
      var state = api.getState();
      var round = state.records.length;
      if (!state.locked && expected[round] && !found[round]) {
        var phase = document.querySelector(".adventure-game__header strong").textContent.trim();
        var feedback = document.querySelector(".sea-feedback").textContent.replace(/\\s+/g, " ").trim();
        var arena = document.querySelector(".sea-arena");
        if (!phase.includes(expected[round][0]) || !feedback.includes(expected[round][1]) || !arena.classList.contains(expected[round][2])) {
          reject(new Error("missing milestone " + round + ": " + phase + " / " + feedback));
          return;
        }
        // The storm has to be visible in the meter, not just the copy.
        if (round === 80 && document.querySelectorAll(".danger-bank.is-storm > span i").length !== 2) {
          reject(new Error("the storm did not shorten the tracking chain to two"));
          return;
        }
        found[round] = { phase: phase, feedback: feedback };
      }
      if (round >= 80 && Object.keys(found).length === 4) { resolve(found); return; }
      if (!state.locked) {
        var prediction = state.pending.choice;
        api.choose(prediction === "L" ? "R" : "L");
      }
      setTimeout(step, 0);
    }
    step();
  })`;
  runCapture(url, "/tmp/shannon-adventure-milestones.png", action);
}

function checkAdventureCaptureFeedback() {
  const url = new URL(entry);
  url.searchParams.set("variant", "adventure");
  url.searchParams.set("name", "反馈测试");
  url.searchParams.set("shell", "1");
  url.searchParams.set("start", "1");
  url.searchParams.set("seed", "1953");
  url.searchParams.set("qa", "1");
  url.searchParams.set("speed", "0");
  const action = `new Promise(function(resolve, reject) {
    var api = window.__twoModePrototype;
    var deadline = Date.now() + 8000;
    function step() {
      if (Date.now() > deadline) { reject(new Error("capture feedback check timed out")); return; }
      var state = api.getState();
      if (!state.locked && state.lives < 3) {
        var feedback = document.querySelector(".sea-feedback").textContent.replace(/\\s+/g, " ").trim();
        var chain = state.records.length > 80 ? 2 : 3;
        if (!feedback.includes("命灯 −1") || !feedback.includes("连续 " + chain + " 次红光锁定")) {
          reject(new Error("life-loss feedback is unclear: " + feedback));
          return;
        }
        resolve({ round: state.records.length, lives: state.lives, feedback: feedback });
        return;
      }
      if (!state.locked) {
        var prediction = state.pending.choice;
        var choice = state.records.length < 10
          ? (prediction === "L" ? "R" : "L")
          : prediction;
        api.choose(choice);
      }
      setTimeout(step, 0);
    }
    step();
  })`;
  runCapture(url, "/tmp/shannon-adventure-capture-feedback.png", action);
}

function checkDuelBanksAndReset() {
  const url = new URL(entry);
  url.searchParams.set("variant", "duel");
  url.searchParams.set("name", "反馈测试");
  url.searchParams.set("shell", "1");
  url.searchParams.set("start", "1");
  url.searchParams.set("seed", "1953");
  url.searchParams.set("qa", "1");
  url.searchParams.set("speed", "0");
  const action = `new Promise(function(resolve, reject) {
    var api = window.__twoModePrototype;
    var deadline = Date.now() + 8000;
    var resetVerified = false;
    var bankBeforeReset;
    var bankAfterReset;
    function step() {
      if (Date.now() > deadline) { reject(new Error("CASE 8 bank check timed out")); return; }
      var state = api.getState();
      var round = state.records.length;
      if (!resetVerified && !state.locked && round === 8) {
        var counter = document.querySelector(".duel-game .lab-header b").textContent.replace(/\\s+/g, " ").trim();
        var status = document.querySelector(".sealed-file-status").textContent.replace(/\\s+/g, " ").trim();
        var segments = document.querySelectorAll(".relay-bank-progress i");
        var reset = document.querySelector('[data-action="reset-duel"]');
        if (counter !== "08 / 64") throw new Error("wrong CASE 8 counter: " + counter);
        if (!status.includes("RELAY BANK 02 / 08") || !status.includes("本组 0 / 8")) {
          throw new Error("wrong bank status: " + status);
        }
        if (segments.length !== 8 || document.querySelectorAll(".relay-bank-progress i.is-complete").length !== 1) {
          throw new Error("bank lamps do not show one completed bank");
        }
        if (!reset) throw new Error("missing CASE 8 reset button");
        reset.click();
        var resetState = api.getState();
        var resetStatus = document.querySelector(".sealed-file-status").textContent.replace(/\\s+/g, " ").trim();
        if (resetState.records.length !== 0 || resetState.screen !== "play") {
          throw new Error("CASE 8 reset did not start a clean live run");
        }
        if (!resetStatus.includes("RELAY BANK 01 / 08") || !resetStatus.includes("本组 0 / 8")) {
          throw new Error("CASE 8 reset did not return to bank 1: " + resetStatus);
        }
        bankBeforeReset = { counter: counter, status: status };
        bankAfterReset = resetStatus;
        resetVerified = true;
        setTimeout(step, 0);
        return;
      }
      if (resetVerified && !state.locked && round === 63) {
        var finalPrediction = state.pending.choice;
        api.choose(finalPrediction === "L" ? "R" : "L");
        var finalState = api.getState();
        var finalStatus = document.querySelector(".sealed-file-status").textContent.replace(/\\s+/g, " ").trim();
        if (finalState.records.length !== 64 || !finalState.locked) {
          throw new Error("final CASE 8 hand was not sealed before result");
        }
        if (!finalStatus.includes("RELAY BANK 08 / 08") || !finalStatus.includes("本组 8 / 8")) {
          throw new Error("final bank status is misleading: " + finalStatus);
        }
        if (document.querySelectorAll(".relay-bank-progress i.is-complete").length !== 8) {
          throw new Error("final CASE 8 bank lamps are incomplete");
        }
        resolve({ before: bankBeforeReset, after: bankAfterReset, final: finalStatus });
        return;
      }
      if (!state.locked) {
        var prediction = state.pending.choice;
        api.choose(prediction === "L" ? "R" : "L");
      }
      setTimeout(step, 0);
    }
    step();
  })`;
  runCapture(url, "/tmp/shannon-duel-bank-reset.png", action);
}

function checkSearchlight() {
  const url = new URL(entry);
  url.searchParams.set("variant", "adventure");
  url.searchParams.set("name", "反馈测试");
  url.searchParams.set("shell", "1");
  url.searchParams.set("start", "1");
  url.searchParams.set("seed", "1953");
  url.searchParams.set("qa", "1");
  url.searchParams.set("speed", "0");
  const action = `new Promise(function(resolve, reject) {
    var api = window.__twoModePrototype;
    var deadline = Date.now() + 9000;
    var seen = { armed: 0, blind: 0, mismatch: 0 };
    function step() {
      if (Date.now() > deadline) { reject(new Error("searchlight check timed out")); return; }
      var state = api.getState();
      if (!state.locked) {
        var readout = document.querySelector(".beam-readout");
        var arena = document.querySelector(".sea-arena");
        if (!readout) { reject(new Error("the voyage shows no confidence readout before the choice")); return; }
        var armed = state.pending.trained;
        var shownArmed = readout.className.indexOf("is-armed") >= 0;
        if (armed !== shownArmed) { seen.mismatch += 1; }
        if (armed !== arena.classList.contains("machine-armed")) { seen.mismatch += 1; }
        seen[armed ? "armed" : "blind"] += 1;

        // Strength only: the sealed side must not be inferable from the DOM.
        var text = document.querySelector(".sea-arena").textContent;
        if (/它押[左右]/.test(readout.textContent)) {
          reject(new Error("the readout leaked the sealed direction: " + readout.textContent));
          return;
        }
        if (arena.classList.contains("beam-left") || arena.classList.contains("beam-right")) {
          reject(new Error("the beam pointed at a lane before the player chose"));
          return;
        }

        if (state.records.length >= 45) {
          if (seen.mismatch) { reject(new Error("readout disagreed with the machine " + seen.mismatch + " times")); return; }
          if (!seen.armed || !seen.blind) { reject(new Error("only one searchlight state was ever shown: " + JSON.stringify(seen))); return; }
          resolve(seen);
          return;
        }
        api.choose(state.pending.choice === "L" ? "R" : "L");
      }
      setTimeout(step, 0);
    }
    step();
  })`;
  runCapture(url, "/tmp/shannon-searchlight.png", action);
}

function checkPersonaReveal() {
  const url = new URL(entry);
  url.searchParams.set("variant", "duel");
  url.searchParams.set("name", "反馈测试");
  url.searchParams.set("shell", "1");
  url.searchParams.set("start", "1");
  url.searchParams.set("seed", "1953");
  url.searchParams.set("qa", "1");
  url.searchParams.set("speed", "0");
  // A committed stayer, so the habit axis has something real to find.
  const action = `new Promise(function(resolve, reject) {
    var api = window.__twoModePrototype;
    var deadline = Date.now() + 9000;
    var previous = null;
    function step() {
      if (Date.now() > deadline) { reject(new Error("persona reveal timed out")); return; }
      var state = api.getState();

      if (state.screen === "result") {
        var card = document.querySelector(".persona-card");
        if (!card) { reject(new Error("the result never named the player's behaviour")); return; }
        var name = card.querySelector(".persona-name").textContent.trim();
        if (!name) { reject(new Error("persona card has no name")); return; }

        // A measured axis must show the statistic that earned it; an unmeasured
        // one must say so rather than being quietly dropped or dressed up.
        var rows = [].map.call(card.querySelectorAll(".persona-axes li"), function (n) {
          return { text: n.textContent.replace(/\\s+/g, " ").trim() };
        });
        if (rows.length < 3) { reject(new Error("expected the run's axes, got " + rows.length)); return; }
        for (var i = 0; i < rows.length; i++) {
          // Every row states this run in figures; only a sealed one claims a
          // p-value, because only a sealed one is making a claim.
          if (!/\\d+%/.test(rows[i].text)) {
            reject(new Error("an axis quoted no figure from the run: " + rows[i].text));
            return;
          }
          var sealed = /已核验/.test(rows[i].text);
          if (sealed !== /p (<|=)/.test(rows[i].text)) {
            reject(new Error("seal and p-value disagree: " + rows[i].text));
            return;
          }
        }
        var axes = rows.map(function (r) { return r.text; });

        // The behavioural title and the egg are different objects and must not
        // borrow each other's language.
        if (/蛋/.test(card.textContent)) { reject(new Error("persona card mentions the egg: " + name)); return; }
        var egg = document.querySelector(".egg-card h1");
        if (egg && new RegExp(name).test(egg.textContent)) {
          reject(new Error("the egg repeated the persona name"));
          return;
        }

        // The remembered reaction stays sealed.
        if (/记住的是|格里写着|学会了留|学会了换/.test(document.body.textContent)) {
          reject(new Error("the result leaked what a cell remembered"));
          return;
        }
        // The coin was cut; no stray affordance may survive.
        if (document.querySelector('[data-action="coin"]')) {
          reject(new Error("a coin control survived the cut"));
          return;
        }
        resolve({ persona: name, axes: axes, egg: egg ? egg.textContent.trim() : null });
        return;
      }

      if (!state.locked) {
        previous = previous === null ? "L" : (Math.random() < 0.82 ? previous : (previous === "L" ? "R" : "L"));
        api.choose(previous);
      }
      setTimeout(step, 0);
    }
    step();
  })`;
  runCapture(url, "/tmp/shannon-persona.png", action);
}

checkAdventureBrief();
checkDirectCase8Entry();
checkCollectionCabinet();
checkFirstPerfectVoyageArchive();
checkCompletedArchiveCertificate();
checkQuickRelayPreference();
checkInitialBeamIsHidden();
checkMode("adventure", ".sea-feedback");
checkMode("duel", ".duel-feedback");
checkAdventureMilestones();
checkAdventureCaptureFeedback();
checkSearchlight();
checkDuelBanksAndReset();
checkPersonaReveal();
process.stdout.write("Onboarding, cumulative archives, the 6/6 certificate, quick retry preference, voyage feedback, the searchlight, behavioural titles, and CASE 8 banks/reset pass.\n");
