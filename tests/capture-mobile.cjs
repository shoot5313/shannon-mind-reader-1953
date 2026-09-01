#!/usr/bin/env node

const { spawn } = require("node:child_process");
const { mkdtempSync } = require("node:fs");
const { rm, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const defaultUrl = pathToFileURL(path.resolve(__dirname, "..", "index.html")).href;
const url = process.argv[2] || defaultUrl;
const output = process.argv[3] || "/tmp/mind-reader-mobile.png";
const width = Number(process.argv[4] || 390);
const height = Number(process.argv[5] || 844);
const action = process.argv[6] || "";
const chromeProfile = mkdtempSync("/tmp/mind-reader-capture-");

const chrome = spawn("google-chrome", [
  "--headless=new",
  "--no-sandbox",
  "--no-first-run",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-background-networking",
  "--hide-scrollbars",
  `--user-data-dir=${chromeProfile}`,
  "--remote-debugging-pipe",
], {
  stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"],
});

let nextId = 0;
let buffer = "";
let stderr = "";
const pending = new Map();
const eventWaiters = [];

chrome.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});
chrome.on("exit", (code, signal) => {
  const error = new Error(`Chrome exited before capture completed (code ${code}, signal ${signal})`);
  for (const waiter of pending.values()) waiter.reject(error);
  pending.clear();
  for (const waiter of eventWaiters.splice(0)) waiter.reject(error);
});
chrome.stdio[3].on("error", (error) => {
  stderr += `\nprotocol write pipe: ${error.stack || error.message}\n`;
});
chrome.stdio[4].on("error", (error) => {
  stderr += `\nprotocol read pipe: ${error.stack || error.message}\n`;
});

chrome.stdio[4].on("data", (chunk) => {
  buffer += chunk.toString();
  const messages = buffer.split("\0");
  buffer = messages.pop();

  for (const raw of messages) {
    if (!raw) continue;
    const message = JSON.parse(raw);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      continue;
    }

    for (let index = eventWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = eventWaiters[index];
      if (waiter.method === message.method && (!waiter.sessionId || waiter.sessionId === message.sessionId)) {
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

function waitForEvent(method, sessionId) {
  return new Promise((resolve, reject) => {
    eventWaiters.push({ method, sessionId, resolve, reject });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function capture() {
  let actionValue;
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: width,
    screenHeight: height,
  }, sessionId);
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);

  const loaded = waitForEvent("Page.loadEventFired", sessionId);
  await send("Page.navigate", { url }, sessionId);
  await loaded;
  await send("Runtime.evaluate", {
    expression: "document.fonts ? document.fonts.ready : Promise.resolve()",
    awaitPromise: true,
  }, sessionId);
  await delay(700);

  if (action) {
    const actionResult = await send("Runtime.evaluate", {
      expression: action,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId);
    if (actionResult.exceptionDetails) {
      throw new Error(actionResult.exceptionDetails.exception?.description || "browser action failed");
    }
    actionValue = actionResult.result?.value;
    await delay(180);
  }

  const dimensions = await send("Runtime.evaluate", {
    expression: "JSON.stringify({innerWidth, innerHeight, scrollX, scrollY, visualTop: visualViewport && visualViewport.offsetTop, visualHeight: visualViewport && visualViewport.height, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight})",
    returnByValue: true,
  }, sessionId);
  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  }, sessionId);
  await writeFile(output, Buffer.from(screenshot.data, "base64"));
  process.stdout.write(`${dimensions.result.value}\n`);
  if (actionValue !== undefined) process.stdout.write(`${JSON.stringify(actionValue)}\n`);
  process.stdout.write(`${output}\n`);
}

capture()
  .catch((error) => {
    process.stderr.write(`${error.stack}\n${stderr}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (chrome.exitCode === null) {
      chrome.kill("SIGTERM");
      await new Promise((resolve) => chrome.once("exit", resolve));
    }
    await rm(chromeProfile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    }).catch(() => {});
  });
