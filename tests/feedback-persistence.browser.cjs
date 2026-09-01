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
          return { text: n.textContent.replace(/\\s+/g, " ").trim(),
                   measured: n.className.indexOf("is-unmeasured") < 0 };
        });
        if (rows.length !== 4) { reject(new Error("expected all four axes, got " + rows.length)); return; }
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].measured && !/p (<|=)/.test(rows[i].text)) {
            reject(new Error("a measured axis carried no p-value: " + rows[i].text));
            return;
          }
          if (!rows[i].measured && !/未测出/.test(rows[i].text)) {
            reject(new Error("an unmeasured axis did not say so: " + rows[i].text));
            return;
          }
        }
        var axes = rows.filter(function (r) { return r.measured; }).map(function (r) { return r.text; });

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
checkInitialBeamIsHidden();
checkMode("adventure", ".sea-feedback");
checkMode("duel", ".duel-feedback");
checkAdventureMilestones();
checkAdventureCaptureFeedback();
checkSearchlight();
checkDuelBanksAndReset();
checkPersonaReveal();
process.stdout.write("Onboarding, persistent feedback, voyage milestones, the searchlight, the behavioural title, and CASE 8 banks/reset pass.\n");
