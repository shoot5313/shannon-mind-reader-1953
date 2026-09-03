const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const releaseFiles = [
  "index.html",
  "two-mode-prototype.css",
  "unified-entry.css",
  "src/engine.js",
  "src/unified-entry.js",
  "src/two-mode-prototype.js",
  "assets/shannon-mind-reader.svg",
  "assets/icon-180.png",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon-1024.png",
];

/*
 * One entry file serves both channels. The mini-tool contract below is what
 * actually keeps the ZIP legal — not a forked copy of the HTML, which sat
 * byte-identical to this one for its whole life and only added drift risk.
 * If a GitHub-only tag is ever added here, this test fails and forces the
 * question "should that ship to 小红书 too?" instead of answering it silently.
 */
test("the single entry satisfies the mini-tool container contract", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");

  // package.json is the only place a version is authored; everything else is
  // checked against it, so a bump never needs this test edited.
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  const declared = html.match(/<meta name="version" content="([^"]+)">/);
  assert.ok(declared, "the entry must declare a version");
  assert.equal(declared[1], pkg.version, "index.html version must match package.json");
  assert.ok(
    changelog.includes(`## ${pkg.version} 更新说明`),
    `CHANGELOG.md must carry an entry for ${pkg.version}`,
  );

  assert.match(html, /<meta name="application-name" content="香农读心机">/);
  assert.match(html, /width=device-width, initial-scale=1\.0, maximum-scale=1\.0, user-scalable=no, viewport-fit=cover/);
  assert.doesNotMatch(html, /Content-Security-Policy/i);
  assert.doesNotMatch(html, /rel="manifest"|\.webmanifest/i);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|javascript:|<base\b|<iframe\b|<object\b/i);
  assert.doesNotMatch(html, /https?:\/\//);
});

test("the entry exposes only the production runtime", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

  assert.match(html, /src\/engine\.js/);
  assert.match(html, /src\/unified-entry\.js/);
  assert.match(html, /src\/two-mode-prototype\.js/);
  assert.doesNotMatch(html, /src\/app\.js|src\/gameplay-prototype\.js/);
  assert.doesNotMatch(html, /href="\.\/styles\.css"|href="\.\/prototype\.css"/);
  assert.doesNotMatch(html, /THROWAWAY PROTOTYPE/);
});

test("CASE 8 has a direct research entrance as well as the post-voyage clue", () => {
  const entry = fs.readFileSync(path.join(root, "src/unified-entry.js"), "utf8");
  const game = fs.readFileSync(path.join(root, "src/two-mode-prototype.js"), "utf8");

  assert.match(entry, /data-launch="duel"/);
  assert.match(entry, /CASE 8 \/ 实验人员入口/);
  assert.match(entry, /直接研究八格机器/);
  assert.match(entry, /64 手 · 攻略封存/);
  assert.doesNotMatch(game, /research-room-button|研究室待开放|研究室已开放/);
  assert.match(game, /class="unfiled-record[^\n]+data-action="research"/);
  assert.match(game, /CASE 8/);
});

test("the relay cabinet exposes and records four treasures plus two CASE 8 seals", () => {
  const engine = fs.readFileSync(path.join(root, "src/engine.js"), "utf8");
  const entry = fs.readFileSync(path.join(root, "src/unified-entry.js"), "utf8");
  const game = fs.readFileSync(path.join(root, "src/two-mode-prototype.js"), "utf8");

  ["余烬金币", "继电罗盘", "香农密钥", "问号原稿", "香农破解章", "重点观察章"].forEach((name) => {
    assert.match(engine, new RegExp(name));
  });
  assert.match(entry, /打开香农档案柜/);
  assert.match(entry, /04 SLOTS/);
  assert.match(entry, /02 SLOTS/);
  assert.match(game, /聪明蛋不是最后一份档案/);
  assert.match(game, /state\.records\.filter\(\(record\) => record\.dangerHit\)\.length/);
  assert.match(game, /Engine\.classifyTreasure\(state\.result\.lives, state\.result\.dangerHits\)/);
  assert.match(game, /collection\.recordAdventure\(/);
  assert.match(game, /collection\.recordDuel\(/);
  assert.match(engine, /qualifyingTreasureIds\(lives, dangerHits\)/);
  assert.match(engine, /qualifying\.push\("shannon-breaker"\)/);
  assert.match(engine, /qualifying\.push\("most-wanted"\)/);
});

test("adventure and CASE 8 use separate, intentional lengths", () => {
  const game = fs.readFileSync(path.join(root, "src/two-mode-prototype.js"), "utf8");

  assert.match(game, /const ADVENTURE_TOTAL = 100;/);
  assert.match(game, /const DUEL_BANKS = 8;/);
  assert.match(game, /const DUEL_BANK_SIZE = 8;/);
  assert.match(game, /const DUEL_TOTAL = DUEL_BANKS \* DUEL_BANK_SIZE;/);
  assert.doesNotMatch(game, /const TOTAL =/);
  assert.match(game, /data-action="reset-duel"/);
});

test("the voyage rules that tests/simulation.test.cjs calibrates against are the shipped ones", () => {
  const game = fs.readFileSync(path.join(root, "src/two-mode-prototype.js"), "utf8");

  assert.match(game, /const WARMUP = 10;/);
  assert.match(game, /const DANGER_CHAIN = 3;/);
  assert.match(game, /const STORM_AT = 80;/);
  assert.match(game, /const STORM_CHAIN = 2;/);

  // The chain length must never be read from the constant where it reaches the
  // player, or the storm keeps reporting "1 / 3".
  assert.match(game, /function chainLengthAt\(round\)/);
  assert.match(game, /chainLength: chainLengthAt\(round\)/);

  // The storm tightens the rule, so it has to be announced.
  assert.match(game, /round === STORM_AT.*连中两次红光就掉一盏灯/);
});

test("the run ends with a statistical reveal about the player, not about the machine", () => {
  const game = fs.readFileSync(path.join(root, "src/two-mode-prototype.js"), "utf8");

  assert.match(game, /Engine\.analyseSwitching\(choices\)/);
  assert.match(game, /Engine\.formatTellReport/);
  // Both endings of the voyage and the research room name the behaviour.
  assert.match(game, /Engine\.classifyPersona/);
  assert.equal(game.match(/^\s+\$\{personaMarkup\(\)\}/gm).length, 3);

  // The behavioural title is its own share card, not a line crowded onto the
  // egg's: two tabs, generated separately.
  assert.match(game, /function drawPersonaShare\(/);
  assert.match(game, /createShareDataUrl\("result"\)|urlFor\("result"\)/);
  assert.match(game, /data-card="persona"/);
  assert.doesNotMatch(game, /drawPersonaShare\(context[^)]*\)[\s\S]{0,40}drawDuelShare/);

  // The behavioural title and the egg must stay separate objects.
  assert.doesNotMatch(game, /persona[^\n]*蛋|蛋[^\n]*persona/);

  // The remembered reaction stays sealed: nothing may render cell.reaction.
  assert.doesNotMatch(game, /\bcell\.reaction\b/);

  // The coin was cut in 1.1.0: measured at 1.7pp once the searchlight shipped,
  // it was a placebo verb competing for attention with the real one.
  assert.doesNotMatch(game, /data-action="coin"|flipCoin|MAX_COINS/);
});

test("the searchlight reports the machine's confidence before the choice, never its direction", () => {
  const game = fs.readFileSync(path.join(root, "src/two-mode-prototype.js"), "utf8");

  // The voyage must read the sealed hand's confidence while the player can
  // still act on it. Without this the loop hands the player nothing to think
  // about and coin-flipping outperforms paying attention.
  assert.match(game, /const armed = Boolean\(state\.pending && state\.pending\.trained\);/);
  assert.match(game, /beamReadoutMarkup\(armed\)/);
  assert.match(game, /machine-armed/);
  assert.match(game, /machine-blind/);

  // Strength only. The sealed direction may never be read before the reveal:
  // the beam class comes from the resolved record, never from state.pending.
  // Comments are stripped first so the rule can be documented in prose.
  const code = game
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /state\.pending\.choice/);
  assert.match(game, /last\.predicted === Engine\.LEFT \? "beam-left" : "beam-right"/);

  // The brief has to teach the light, and must not teach the counter-move.
  assert.match(game, /brief-beacon/);
  assert.match(game, /灯亮，说明它认得这个局面/);
  assert.match(game, /怎么用这盏灯，不会告诉你/);
});

test("release runtime is self-contained, permission-light, and below 10 MiB before compression", () => {
  let bytes = 0;
  let source = "";
  for (const relative of releaseFiles) {
    const absolute = path.join(root, relative);
    assert.ok(fs.existsSync(absolute), `missing ${relative}`);
    bytes += fs.statSync(absolute).size;
    if (/\.(?:html|css|js|json|svg)$/.test(relative)) {
      source += fs.readFileSync(absolute, "utf8");
    }
  }

  assert.ok(bytes < 10 * 1024 * 1024, `release sources total ${bytes} bytes`);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|getUserMedia)\s*\(/);
  assert.doesNotMatch(source, /\b(?:sessionStorage|indexedDB|mediaDevices|geolocation|Notification)\b/);
  const entryRuntime = fs.readFileSync(path.join(root, "src/unified-entry.js"), "utf8");
  assert.equal(
    (entryRuntime.match(/window\.localStorage/g) || []).length,
    1,
    "the cabinet is the only runtime feature allowed to request local persistence",
  );
  assert.match(source, /shannon-mind-reader\.collection\.v2/);
  assert.match(source, /shannon-mind-reader\.collection\.v1/, "the v1 cabinet must migrate in place");
  assert.match(source, /Names, individual moves and routes[\s*]+never enter this store/);
  assert.doesNotMatch(source, /\b(?:eval|Function)\s*\(|\bWebAssembly\b|\b(?:Worker|SharedWorker)\s*\(/);
  assert.doesNotMatch(source, /window\.location\.href\s*=|location\.assign\s*\(|<a[^>]+\bdownload\b/i);
  assert.match(source, /window\.xhs\.miniTool\.writeTempFile/);
  assert.match(source, /window\.xhs\.miniTool\.saveImageToPhotosAlbum/);
  assert.match(source, /100% 笨蛋/);
  assert.doesNotMatch(source, /傻蛋/);
  const absoluteUrls = Array.from(source.matchAll(/https?:\/\/[^\s"']+/g), (match) => match[0]);
  assert.deepEqual(absoluteUrls, ["http://www.w3.org/2000/svg"]);
});

/*
 * The upload record must describe the artifact that actually exists. These
 * three numbers were hand-synced before and went stale twice in one session;
 * build-release.sh now writes them, and this catches any later hand-editing.
 * Skipped on a fresh clone, where dist/ has not been built yet.
 */
test("the 小红书 upload record matches the built artifact", (t) => {
  const artifactPath = path.join(root, "dist", "artifact.json");
  const recordPath = path.join(root, "XHS_VALIDATION.md");
  // Submission material is kept off the public repo, so a clone has neither the
  // record nor a build. Present locally, it still has to agree with the artifact.
  if (!fs.existsSync(recordPath) || !fs.existsSync(artifactPath)) {
    t.skip("小红书 submission material is local-only; nothing to cross-check here");
    return;
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const record = fs.readFileSync(recordPath, "utf8");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

  assert.equal(artifact.version, pkg.version, "artifact was built from a different version");
  assert.ok(record.includes(`dist/${artifact.archive}`), "record points at another archive");
  assert.ok(record.includes(`\`${artifact.bytes}\` bytes`), "recorded size is stale");
  assert.ok(record.includes(artifact.sha256), "recorded ZIP SHA-256 is stale");
  assert.ok(record.includes(artifact.iconSha256), "recorded icon SHA-256 is stale");

  const zip = fs.readFileSync(path.join(root, "dist", artifact.archive));
  assert.equal(zip.length, artifact.bytes, "the archive on disk no longer matches its record");
});

/*
 * Both READMEs point a sceptical reader at one specific line to check the
 * "the machine bets first" claim for themselves. A line number in prose rots
 * the moment anyone edits above it, so it is pinned here.
 */
test("the READMEs cite the right line for the sealed-prediction test", () => {
  const engineTest = fs.readFileSync(path.join(root, "tests/engine.test.cjs"), "utf8").split("\n");
  const cited = [
    { file: "README.md", pattern: /tests\/engine\.test\.cjs` 第 (\d+) 行/ },
    { file: "README.en.md", pattern: /tests\/engine\.test\.cjs:(\d+)`/ },
  ];
  cited.forEach(({ file, pattern }) => {
    const readme = fs.readFileSync(path.join(root, file), "utf8");
    const match = readme.match(pattern);
    assert.ok(match, `${file} must cite the sealed-prediction test`);
    const line = engineTest[Number(match[1]) - 1] || "";
    assert.match(
      line,
      /a prediction is committed before the choice is observed/,
      `${file} cites line ${match[1]}, which is now: ${line.trim()}`,
    );
  });
});

test("shipped source carries no stray non-CJK scripts", () => {
  // A colour literal once picked up an Arabic letter from a bad paste and still
  // parsed. Text is either ASCII, CJK, or the punctuation this project uses.
  const sources = ["src/engine.js", "src/unified-entry.js", "src/two-mode-prototype.js"]
    .map((relative) => ({ relative, text: fs.readFileSync(path.join(root, relative), "utf8") }));
  const allowed = /[\u0000-\u007f\u2000-\u206f\u2100-\u214f\u2190-\u21ff\u2200-\u22ff\u2300-\u23ff\u2500-\u25ff\u3000-\u303f\u4e00-\u9fff\uff00-\uffef\u00a0-\u00ff]/;
  sources.forEach(({ relative, text }) => {
    const stray = Array.from(text).filter((glyph) => !allowed.test(glyph));
    assert.deepEqual(stray, [], `${relative} contains unexpected glyphs: ${JSON.stringify(stray.slice(0, 5))}`);
  });
});

/*
 * Strips comments and string/template literals so UI copy cannot trip the syntax
 * checks below. The sealed-file placeholder is literally "???", which a naive
 * scan reads as nullish coalescing.
 */
function stripLiterals(source) {
  let out = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 2;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      index += 1;
      while (index < source.length) {
        if (source[index] === "\\") { index += 2; continue; }
        if (source[index] === quote) { index += 1; break; }
        index += 1;
      }
      out += `${quote}${quote}`;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

test("release JavaScript stays within the Chrome 61 / ES2017 baseline", () => {
  const files = ["src/engine.js", "src/unified-entry.js", "src/two-mode-prototype.js"];
  const code = files
    .map((relative) => stripLiterals(fs.readFileSync(path.join(root, relative), "utf8")))
    .join("\n");

  const banned = [
    [/\?\.[A-Za-z_$[(]/, "optional chaining (ES2020)"],
    [/\?\?/, "nullish coalescing (ES2020)"],
    [/\|\|=|&&=/, "logical assignment (ES2021)"],
    [/[{,]\s*\.\.\.[A-Za-z_$]/, "object spread (ES2018)"],
    [/\bcatch\s*\{/, "optional catch binding (ES2019)"],
    [/\.flat\s*\(|\.flatMap\s*\(|\.at\s*\(|\.replaceAll\s*\(/, "ES2019+ array/string methods"],
    [/Object\.hasOwn\s*\(|structuredClone\s*\(/, "ES2022 helpers"],
    [/\bBigInt\b/, "BigInt (ES2020)"],
    [/#[A-Za-z_$][\w$]*\s*[=(;]/, "private class fields (ES2022)"],
  ];
  banned.forEach(([pattern, label]) => {
    assert.doesNotMatch(code, pattern, `${label} needs transpilation for Chrome 61`);
  });

  // globalThis is ES2020, so every mention has to sit inside a typeof guard with
  // a fallback. `typeof` on an undeclared name does not throw, which is what
  // makes the guard safe on Chrome 61.
  const mentions = (code.match(/globalThis/g) || []).length;
  const guarded = (code.match(/typeof globalThis !== "" \? globalThis :/g) || []).length;
  assert.ok(mentions > 0, "the guard itself should still be present");
  assert.equal(mentions, guarded * 2, "every globalThis must be inside a typeof guard with a fallback");

  // That fallback is `this`, which is only the global object while the file is a
  // classic non-strict script. A top-level "use strict" would make it undefined.
  const engine = fs.readFileSync(path.join(root, "src/engine.js"), "utf8");
  assert.doesNotMatch(
    engine.split("\n").slice(0, 3).join("\n"),
    /"use strict"/,
    "engine.js must stay non-strict at file scope or the globalThis fallback breaks",
  );
});

test("release CSS has a Chrome 61 baseline before modern enhancements", () => {
  const styles = ["unified-entry.css", "two-mode-prototype.css"]
    .map((relative) => fs.readFileSync(path.join(root, relative), "utf8"))
    .join("\n");
  const runtime = fs.readFileSync(path.join(root, "src/unified-entry.js"), "utf8");

  assert.match(styles, /Chrome 61 baseline/);
  assert.match(styles, /\.entry-hero\s*\{[^}]*min-height:\s*720px;[^}]*grid-gap:/s);
  assert.match(styles, /\.adventure-game\s*\{[^}]*grid-gap:\s*7px;[^}]*padding:\s*12px 13px 76px;/s);
  assert.match(styles, /\.two-mode-prototype button:focus\s*\{/);
  assert.match(styles, /\.unified-entry button:focus,/);
  assert.match(styles, /@supports \(aspect-ratio:\s*1 \/ 1\)/);
  assert.match(runtime, /flex\.scrollHeight === 1/);
  assert.match(runtime, /classList\.add\("supports-flex-gap"\)/);
});

test("release typography keeps functional text out of illegible microtype", () => {
  const styles = ["unified-entry.css", "two-mode-prototype.css"]
    .map((relative) => fs.readFileSync(path.join(root, relative), "utf8"))
    .join("\n");
  const absoluteSizes = Array.from(
    styles.matchAll(/(?:font-size\s*:\s*|font\s*:[^;{}]*?)(\d+(?:\.\d+)?)px/g),
    (match) => ({ size: Number(match[1]), declaration: match[0] }),
  );
  const tiny = absoluteSizes.filter(({ size }) => size < 10);

  assert.deepEqual(tiny, [], `font declarations below 10px: ${JSON.stringify(tiny)}`);
  assert.match(styles, /--type-body:\s*16px/);
  assert.match(styles, /\.rule-sequence li span[^}]*font-size:\s*var\(--type-body\)/s);
  assert.match(styles, /--type-micro:\s*11px/);
  assert.match(styles, /\.memory-cell > b[^}]*font-size:\s*14px/s);
  assert.match(styles, /\.memory-cell > small[^}]*font-size:\s*var\(--type-label\)/s);
  assert.match(styles, /\.memory-grid\s*\{[^}]*grid-template-rows:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
});
