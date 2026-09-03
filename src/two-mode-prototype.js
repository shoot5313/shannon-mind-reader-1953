/*
 * Product runtime for one public journey with two layers:
 * ?variant=adventure  — the default survival chase
 * ?variant=duel       — the eight-cell research room opened after a voyage
 *
 * Both layers share the same 1953 predictor. The public interface never shows
 * the remembered reaction or teaches a counter-strategy.
 */
(function installTwoModePrototype() {
  "use strict";

  const Engine = window.MindReader;
  const MODES = ["adventure", "duel"];
  if (!Engine) return;
  let activeCleanup = null;

  function startTwoModePrototype(options = {}) {
  const params = new URLSearchParams(window.location.search);
  let mode = options.mode || params.get("variant");
  if (!MODES.includes(mode)) return;
  const unifiedShell = typeof options.unifiedShell === "boolean"
    ? options.unifiedShell
    : params.get("shell") === "1";
  const nickname = Engine.normaliseNickname(options.nickname || params.get("name"));
  const collection = miniTool.collection || Engine.createCollectionStore(null);
  miniTool.collection = collection;
  const startImmediately = typeof options.startImmediately === "boolean"
    ? options.startImmediately
    : unifiedShell && params.get("start") === "1";

  const ADVENTURE_TOTAL = 100;
  const DUEL_BANKS = 8;
  const DUEL_BANK_SIZE = 8;
  const DUEL_TOTAL = DUEL_BANKS * DUEL_BANK_SIZE;
  const WARMUP = 10;
  const DANGER_CHAIN = 3;
  // The storm is a real rule, not weather art: past this mark two consecutive
  // memory hits cost a lamp instead of three. Shortening the voyage without it
  // handed the rarest treasure to whoever engaged least — see
  // experiments/tune-adventure.cjs.
  const STORM_AT = 80;
  const STORM_CHAIN = 2;
  const MAX_LIVES = 3;
  const diagnosticSeed = Number.parseInt(params.get("seed"), 10);
  const instant = params.get("speed") === "0";
  const cellOrder = Engine.SHANNON_CELL_ORDER;

  if (activeCleanup) activeCleanup();
  const unifiedEntry = document.querySelector("#unifiedEntry");
  if (unifiedEntry) unifiedEntry.remove();
  document.body.classList.remove("unified-entry-mode");
  const root = document.createElement("main");
  root.id = "twoModePrototype";
  root.className = "two-mode-prototype";
  document.body.classList.add("two-mode-prototype-mode");
  document.body.append(root);

  let audioContext = null;
  let runNumber = 0;
  let renderToken = 0;
  let state = createRun(mode, startImmediately);

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const safeNickname = escapeHtml(nickname);

  function seedForRun() {
    if (Number.isInteger(diagnosticSeed)) return (diagnosticSeed + runNumber) >>> 0;
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const buffer = new Uint32Array(1);
      window.crypto.getRandomValues(buffer);
      return buffer[0];
    }
    return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
  }

  function createRun(nextMode, startImmediately = false) {
    runNumber += 1;
    const predictor = Engine.createShannonPredictor({ seed: seedForRun() });
    const cabinet = collection.snapshot();
    return {
      mode: nextMode,
      predictor,
      pending: predictor.predict(),
      records: [],
      lives: MAX_LIVES,
      danger: 0,
      screen: startImmediately ? "play" : "brief",
      locked: false,
      last: null,
      result: null,
      archiveUpdate: null,
      newUnlocks: [],
      quickMode: nextMode === "adventure"
        ? cabinet.preferences.quickAdventure
        : cabinet.preferences.quickDuel,
    };
  }

  function safeVibrate(pattern) {
    if (instant) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function tone(frequency, duration, options = {}) {
    if (instant) return;
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = options.type || "square";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(options.gain || 0.035, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (_error) {
      // Sound is garnish; sandboxed WebViews may deny it.
    }
  }

  function playFeedback(record) {
    if (record.lifeLost) {
      tone(92, 0.7, { type: "sawtooth", gain: 0.07 });
      window.setTimeout(() => tone(58, 0.5, { type: "square", gain: 0.05 }), 110);
      safeVibrate([80, 45, 160, 45, 260]);
    } else if (record.dangerHit) {
      tone(145 + state.danger * 35, 0.18, { gain: 0.055 });
      safeVibrate([55, 25, 75]);
    } else if (record.correct) {
      tone(170, 0.08, { gain: 0.025 });
      safeVibrate(25);
    } else {
      tone(510, 0.055, { type: "sine", gain: 0.025 });
      safeVibrate(12);
    }
  }

  function modeSwitcher() {
    const title = mode === "adventure" ? "A / 冒险寻宝" : "B / 八格研究室";
    const cabinet = collection.snapshot();
    return `
      <nav class="mode-switcher product-dock" aria-label="当前任务">
        <button type="button" data-home aria-label="返回 1953 实验大厅"><span>⌁</span><small>1953</small></button>
        <div><small>CALLSIGN / ${safeNickname}</small><strong>${title}</strong></div>
        <button class="product-dock__seal product-dock__collection" type="button" data-collection aria-label="打开香农档案柜，已收录 ${cabinet.count} / ${cabinet.total}"><b><i data-collection-count>${cabinet.count}</i> / ${cabinet.total}</b><small>档案柜</small></button>
      </nav>
    `;
  }

  function switchMode(nextMode) {
    if (!MODES.includes(nextMode) || nextMode === mode) return;
    renderToken += 1;
    mode = nextMode;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("variant", mode);
    window.history.replaceState({}, "", nextUrl);
    state = createRun(mode);
    render();
  }

  function goHome() {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("variant", "hub");
    nextUrl.searchParams.delete("shell");
    nextUrl.searchParams.delete("start");
    nextUrl.searchParams.delete("qa");
    window.history.replaceState({}, "", nextUrl);
    dispose();
    if (window.ShannonMiniTool && typeof window.ShannonMiniTool.showHub === "function") {
      window.ShannonMiniTool.showHub({ nickname });
    }
  }

  function shortSide(choice) {
    return choice === Engine.LEFT ? "左" : "右";
  }

  function begin() {
    if (state.screen !== "brief") return;
    state.screen = "play";
    tone(mode === "adventure" ? 220 : 310, 0.14, { type: "triangle", gain: 0.045 });
    render();
  }

  function restart() {
    renderToken += 1;
    state = createRun(mode, unifiedShell);
    render();
  }

  function resetDuel() {
    if (mode !== "duel" || state.screen !== "play") return;
    renderToken += 1;
    state = createRun("duel", true);
    tone(250, 0.1, { type: "triangle", gain: 0.03 });
    render();
  }

  function enterResearchRoom() {
    if (mode !== "adventure" || state.screen !== "result") return;
    switchMode("duel");
  }

  function openCollectionCabinet() {
    if (typeof miniTool.showCollectionCabinet !== "function") return;
    miniTool.showCollectionCabinet({ highlightIds: state.newUnlocks });
  }

  function recordRunResult() {
    state.newUnlocks = [];
    if (mode === "adventure") {
      const dangerHits = state.records.filter((record) => record.dangerHit).length;
      state.result.dangerHits = dangerHits;
      if (state.result.outcome === "treasure") {
        state.result.treasure = Engine.classifyTreasure(state.result.lives, dangerHits);
      }
      state.archiveUpdate = collection.recordAdventure({
        distance: state.result.outcome === "treasure" ? ADVENTURE_TOTAL : state.result.round,
        lives: state.result.outcome === "treasure" ? state.result.lives : 0,
        dangerHits,
      });
    } else {
      state.archiveUpdate = collection.recordDuel({
        playerWins: state.result.playerWins,
        machineWins: state.result.machineWins,
      });
    }
    state.newUnlocks = state.archiveUpdate.newUnlocks.slice();
  }

  function quickModeAvailable() {
    const records = collection.snapshot().records;
    return mode === "adventure" ? records.adventureRuns > 0 : records.duelRuns > 0;
  }

  function toggleQuickMode() {
    if (!quickModeAvailable()) return;
    state.quickMode = !state.quickMode;
    collection.setQuickMode(mode, state.quickMode);
    render();
  }

  function quickModeButton(extraClass = "") {
    if (!quickModeAvailable()) return "";
    const label = state.quickMode ? "快速" : "标准";
    return `<button class="relay-speed-toggle ${extraClass}" type="button" data-action="toggle-speed" aria-pressed="${state.quickMode}"><small>继电速度</small><strong>${label}</strong></button>`;
  }

  // The chain the player is currently sailing under. Read this instead of
  // DANGER_CHAIN anywhere the number reaches the screen, or the storm will
  // still say "1 / 3".
  function chainLengthAt(round) {
    return round > STORM_AT ? STORM_CHAIN : DANGER_CHAIN;
  }

  function choose(choice) {
    if (state.screen !== "play" || state.locked) return;
    if (choice !== Engine.LEFT && choice !== Engine.RIGHT) return;

    const committed = state.pending;
    const observed = state.predictor.observe(choice);
    const round = state.records.length + 1;
    const record = Object.assign({}, observed, {
      trained: committed.trained,
      state: committed.state,
      cell: committed.cell,
      dangerHit: false,
      lifeLost: false,
    });

    if (mode === "adventure") {
      const dangerState = Engine.advanceAdventureDanger(
        { lives: state.lives, danger: state.danger },
        { round, trained: record.trained, correct: record.correct },
        { warmup: WARMUP, chainLength: chainLengthAt(round) },
      );
      state.lives = dangerState.lives;
      state.danger = dangerState.danger;
      record.dangerHit = dangerState.dangerHit;
      record.lifeLost = dangerState.lifeLost;
    }

    state.records.push(record);
    state.last = record;
    state.locked = true;
    playFeedback(record);
    render();

    const delay = instant
      ? 0
      : state.quickMode
        ? record.lifeLost ? 850 : record.dangerHit ? 480 : 240
        : record.lifeLost ? 1250 : record.dangerHit ? 720 : 420;
    const token = renderToken;
    window.setTimeout(() => {
      if (token !== renderToken) return;
      if (mode === "adventure" && state.lives === 0) {
        state.screen = "result";
        state.result = { outcome: "captured", round: state.records.length };
        recordRunResult();
      } else if (state.records.length >= (mode === "adventure" ? ADVENTURE_TOTAL : DUEL_TOTAL)) {
        state.screen = "result";
        state.result = mode === "adventure"
          ? { outcome: "treasure", round: ADVENTURE_TOTAL, lives: state.lives }
          : duelResult();
        recordRunResult();
      } else {
        state.pending = state.predictor.predict();
      }
      state.locked = false;
      render();
    }, delay);
  }

  function duelResult() {
    const machineWins = state.records.filter((record) => record.correct).length;
    const playerWins = DUEL_TOTAL - machineWins;
    return {
      outcome: "duel",
      playerWins,
      machineWins,
      egg: Engine.classifyEggScore(playerWins, machineWins),
      visitProfile: Engine.summariseShannonVisits(state.records),
    };
  }

  function adventureBrief() {
    return `
      <section class="adventure-shell adventure-brief">
        <header class="chart-masthead">
          <span>SHANNON STRAIT · 1953</span><b>海图 № ${String(runNumber).padStart(2, "0")} · ${safeNickname}</b>
        </header>
        <div class="brief-map" aria-hidden="true">
          <i class="brief-map__island"></i><i class="brief-map__route"></i><i class="brief-map__ship"></i>
          <span class="brief-map__x">×</span>
        </div>
        <p class="adventure-kicker">机器已经先押好了</p>
        <h1>活着抵达<br>第 ${ADVENTURE_TOTAL} 海里</h1>
        <p class="adventure-lead">机器每一手先暗押一条路，你再选左或右。它押中会照到你，押错你就躲开。</p>
        <div class="brief-beacon">
          <div class="brief-beacon__lamp" aria-hidden="true"><i></i></div>
          <div>
            <small>出手前先看灯塔</small>
            <strong>灯亮，说明它认得这个局面</strong>
            <span>灯暗就是瞎猜。灯只说它有多大把握，永远不说它押了哪边。</span>
          </div>
        </div>
        <div class="brief-rules">
          <div><b>${WARMUP}</b><span>风平浪静 · 先学会看灯</span></div>
          <div><b>0${DANGER_CHAIN}</b><span>风浪中红光连中掉命</span></div>
          <div><b>${STORM_AT}</b><span>此后大浪滔天 · 连中两次就掉灯</span></div>
        </div>
        <button class="adventure-start" type="button" data-action="begin"><span>开始安全观察</span><small>第一手猜测已经封存</small></button>
        <p class="fair-rule">灯什么时候亮，是你自己教给它的。怎么用这盏灯，不会告诉你。</p>
      </section>
    `;
  }

  function dangerMarkup() {
    const chainLength = chainLengthAt(state.records.length + 1);
    const lamps = Array.from({ length: MAX_LIVES }, (_, index) => {
      const alive = index < state.lives;
      return `<i class="life-lantern ${alive ? "is-alive" : "is-out"}"><span></span></i>`;
    }).join("");
    const chain = Array.from({ length: chainLength }, (_, index) => (
      `<i class="${index < state.danger ? "is-hot" : ""}"></i>`
    )).join("");
    return `
      <div class="adventure-status">
        <div class="life-bank" aria-label="剩余 ${state.lives} 条命"><small>命灯</small><span>${lamps}</span></div>
        <div class="danger-bank ${chainLength === STORM_CHAIN ? "is-storm" : ""}" aria-label="危险连击 ${state.danger} / ${chainLength}"><small>追踪链</small><span>${chain}</span></div>
      </div>
    `;
  }

  function wakeMarkup() {
    const recent = state.records.slice(-14);
    const empty = Math.max(0, 14 - recent.length);
    return `${Array.from({ length: empty }, () => "<i></i>").join("")}${recent.map((record) => {
      const classes = [record.actual === Engine.LEFT ? "go-left" : "go-right"];
      if (record.dangerHit) classes.push("is-danger");
      if (record.lifeLost) classes.push("is-capture");
      return `<i class="${classes.join(" ")}">${record.actual}</i>`;
    }).join("")}`;
  }

  function voyagePhase(round) {
    if (round < WARMUP) return `风平浪静 · 安全观察 ${String(round).padStart(2, "0")} / ${WARMUP}`;
    if (round < STORM_AT) return `波涛汹涌 · 离宝藏还有 ${ADVENTURE_TOTAL - round}`;
    // The shortened chain is carried by the red two-slot meter and the milestone
    // announcement; repeating it here wrapped the header onto a second line.
    return `大浪滔天 · 最后 ${ADVENTURE_TOTAL - round} 海里`;
  }

  function voyageWeather(round) {
    if (round < WARMUP) return "sea-calm";
    if (round < STORM_AT) return "sea-rough";
    return "sea-tempest";
  }

  function voyageMilestone(round) {
    if (round === WARMUP) return "风浪骤起 · 下一手开始，红光会累计追踪链";
    if (round === 40) return "穿过第一阵风浪 · 离宝藏还有 60 海里";
    if (round === 60) return "驶入深水风暴 · 离宝藏还有 40 海里";
    // A rule getting harsher has to be announced. Tightening the chain in
    // silence would be a black-box punishment.
    if (round === STORM_AT) return "大浪滔天 · 从这里开始，连中两次红光就掉一盏灯";
    return "";
  }

  function adventureFeedback() {
    const record = state.last;
    if (!record) {
      return {
        tone: "ready",
        line: "第一手猜测已经封存",
        outcome: "现在选左或右",
        detail: `安全观察 00 / ${WARMUP} · 这段不会掉命`,
        milestone: "",
      };
    }

    const chainLength = chainLengthAt(record.index);
    const base = {
      line: `它押${shortSide(record.predicted)} · 你走${shortSide(record.actual)}`,
      milestone: voyageMilestone(record.index),
    };

    if (record.index <= WARMUP) {
      return Object.assign({}, base, {
        tone: record.correct ? "observed" : "escape",
        outcome: record.correct ? "它猜中了" : "你躲开了",
        detail: `安全观察 ${String(record.index).padStart(2, "0")} / ${WARMUP} · 不会掉命，先看清灯`,
      });
    }
    if (record.lifeLost) {
      return Object.assign({}, base, {
        tone: "alarm",
        outcome: "命灯 −1",
        detail: `连续 ${chainLength} 次红光锁定 · 追踪链归零`,
      });
    }
    if (record.dangerHit) {
      const remaining = chainLength - state.danger;
      return Object.assign({}, base, {
        tone: "danger",
        outcome: "红光锁定",
        detail: `追踪链 ${state.danger} / ${chainLength} · 再中 ${remaining} 次就会掉命`,
      });
    }
    if (record.correct) {
      return Object.assign({}, base, {
        tone: "graze",
        outcome: "黄光擦过",
        detail: "它猜中了，但没有锁定 · 追踪链归零",
      });
    }
    return Object.assign({}, base, {
      tone: "escape",
      outcome: "你躲开了",
      detail: "没有被锁定 · 追踪链归零",
    });
  }

  function adventureFeedbackMarkup(feedback) {
    return `
      <div class="sea-feedback is-${feedback.tone}" aria-live="polite">
        <strong><span>${feedback.line}</span><b>${feedback.outcome}</b></strong>
        ${feedback.milestone ? `<em>${feedback.milestone}</em>` : ""}
        <small>${feedback.detail}</small>
      </div>
    `;
  }

  /*
   * The searchlight. It reports whether the machine is acting on a cell it has
   * already learned or is blind-guessing — strength, never direction. This is
   * the round-two rule ("探照灯只泄露机器把握的强弱，不泄露方向") finally wired up:
   * without it the voyage gave the player nothing to act on for 97 of 100 hands,
   * and coin-flipping beat paying attention.
   *
   * state.pending.choice must never reach the DOM from here.
   */
  function beamReadoutMarkup(armed) {
    return `
      <div class="beam-readout ${armed ? "is-armed" : "is-blind"}" aria-live="polite">
        <i aria-hidden="true"></i>
        <strong>${armed ? "它认得这个局面" : "它没见过这个局面"}</strong>
        <small>${armed ? "这一手它有把握" : "这一手它只能瞎猜"}</small>
      </div>
    `;
  }

  function adventureGame() {
    const round = state.records.length;
    const next = Math.min(ADVENTURE_TOTAL, round + 1);
    const progress = (round / ADVENTURE_TOTAL) * 100;
    const last = state.last;
    const resolving = state.locked && last;
    const armed = Boolean(state.pending && state.pending.trained);
    const feedback = adventureFeedback();
    const arenaClasses = ["sea-arena", voyageWeather(round)];
    if (resolving) arenaClasses.push(last.correct ? "is-lit" : "is-miss");
    if (resolving && last.dangerHit) arenaClasses.push("is-danger-hit");
    if (resolving && last.lifeLost) arenaClasses.push("is-captured");
    if (resolving) arenaClasses.push(last.predicted === Engine.LEFT ? "beam-left" : "beam-right");
    if (!last) arenaClasses.push("is-standby");
    else if (!resolving) arenaClasses.push("is-searching");
    if (!resolving) arenaClasses.push(armed ? "machine-armed" : "machine-blind");
    const shipSide = last ? last.actual : Engine.LEFT;
    const phase = voyagePhase(round);

    return `
      <section class="adventure-shell adventure-game">
        <header class="adventure-game__header">
          <div><small>SHANNON STRAIT · ${safeNickname}</small><strong>${phase}</strong></div>
          <div class="nautical-counter"><b>${String(round).padStart(3, "0")}</b><span>/ ${ADVENTURE_TOTAL} 海里</span></div>
        </header>
        ${dangerMarkup()}
        <div class="voyage-rail">
          <i style="width:${progress}%"></i><span style="left:calc(${progress}% - 7px)"></span><b>×</b>
          <div class="voyage-stops" aria-hidden="true">
            ${[WARMUP, 40, 60, STORM_AT].map((stop) => `<em class="${round >= stop ? "is-passed" : ""} ${stop === STORM_AT ? "is-storm" : ""}" style="left:${(stop / ADVENTURE_TOTAL) * 100}%"><i></i><small>${stop}</small></em>`).join("")}
          </div>
        </div>
        <div class="${arenaClasses.join(" ")}" aria-live="polite">
          <div class="sea-weather" aria-hidden="true"><i></i><i></i><i></i><b></b></div>
          <div class="lighthouse"><i></i><span>SHANNON</span></div>
          <div class="search-cone"></div>
          <div class="sea-lane sea-lane--left"><span>左航道</span></div>
          <div class="sea-lane sea-lane--right"><span>右航道</span></div>
          <div class="pirate-ship ${shipSide === Engine.RIGHT ? "sail-right" : "sail-left"}">
            <i class="sail sail--back"></i><i class="mast"></i><i class="sail sail--front"></i><b></b>
          </div>
          <div class="capture-cage" aria-hidden="true"><i></i><i></i><i></i><i></i><strong>截获</strong></div>
          ${resolving ? "" : beamReadoutMarkup(armed)}
          ${adventureFeedbackMarkup(feedback)}
        </div>
        <div class="wake-strip" aria-label="最近十四个航向">${wakeMarkup()}</div>
        <div class="helm-controls">
          <button type="button" data-choice="L" ${state.locked ? "disabled" : ""}><span>‹</span><strong>驶入左航道</strong><small>PORT / L</small></button>
          <button type="button" data-choice="R" ${state.locked ? "disabled" : ""}><strong>驶入右航道</strong><small>STARBOARD / R</small><span>›</span></button>
        </div>
        <div class="adventure-commandline">
          <p class="adventure-footnote">第 ${String(next).padStart(3, "0")} 手机器已押好 · 请选择航道</p>
          ${quickModeButton("relay-speed-toggle--game")}
        </div>
      </section>
    `;
  }

  function treasureMap(treasure) {
    return `
      <div class="treasure-map treasure-map--${treasure.id}" aria-label="${treasure.name}的寻获海图">
        <div class="treasure-index"><small>TREASURE ARCHIVE</small><b>${treasure.archiveNumber} / 04</b></div>
        <div class="map-compass"><i>N</i><span></span></div>
        <svg viewBox="0 0 300 360" role="img" aria-label="从香农灯塔到宝藏岛的路线">
          <path class="map-coast" d="M-20 55 C55 22 79 70 130 45 C188 17 227 35 320 3 L320 -10 L-20 -10 Z"/>
          <path class="map-island" d="M173 277 C203 249 262 255 282 290 C302 325 250 349 205 339 C164 330 146 301 173 277 Z"/>
          <path class="map-route" d="M43 77 C18 136 119 131 82 190 C52 238 148 220 188 294"/>
          <circle cx="43" cy="77" r="7"/><circle cx="82" cy="190" r="5"/>
          <path class="map-x" d="M205 286 L236 317 M236 286 L205 317"/>
        </svg>
        <div class="treasure-artifact treasure-artifact--${treasure.id}" aria-hidden="true"><i></i><b></b><span></span></div>
        <span class="map-place map-place--start">香农灯塔</span><span class="map-place map-place--end">${treasure.name}</span>
      </div>
    `;
  }

  /*
   * The end-of-run reveal. Everything here is computed from the player's own
   * moves; the eight cells' remembered reactions stay sealed.
   */
  function tellReport() {
    const choices = state.records.map((record) => record.actual);
    const analysis = Engine.analyseSwitching(choices);
    return { analysis, report: Engine.formatTellReport(analysis) };
  }

  /*
   * The behavioural title. Deliberately a different kind of object from the egg:
   * the egg is a sticker for how the run came out, this is a name for how it was
   * played. A player the four tests could not read gets 无名氏 rather than an
   * invented type.
   */
  function personaMarkup() {
    const persona = Engine.classifyPersona(state.records);
    const tell = tellReport();
    const evidence = persona.axes.map((axis) => `
      <li class="${axis.sealed ? "is-sealed" : ""}">
        <strong>${escapeHtml(axis.headline)}${axis.sealed ? '<em class="axis-seal">已核验</em>' : ""}</strong>
        <small>${escapeHtml(axis.detail)}</small>
      </li>
    `).join("");
    return `
      <details class="persona-card ${persona.unread ? "is-unread" : ""}">
        <summary aria-label="展开本局行为称号的依据">
          <span class="persona-eyebrow">BEHAVIOURAL PROFILE</span>
          <strong class="persona-name">${escapeHtml(persona.name)}</strong>
          <small class="persona-meta">${persona.sealed ? `${persona.sealed} 项经机器核验` : "本局打法记录"} · 展开看数字</small>
        </summary>
        ${persona.unread
          ? `<p class="persona-unread">${escapeHtml(persona.summary)}<em>${escapeHtml(tell.report.reason === "sample" ? "手数太少，它没机会读你。" : "四项都没有明显偏向——机器一无所获。")}</em></p><ul class="persona-axes">${evidence}</ul>`
          : `<ul class="persona-axes">${evidence}</ul>`}
      </details>
    `;
  }

  function researchClue(won) {
    return `
      <button class="unfiled-record ${won ? "unfiled-record--chart" : "unfiled-record--wreck"}" type="button" data-action="research" aria-label="拆开未登记的第八号档案">
        <span>${won ? "FOUND ON MAP VERSO" : "RECOVERED FROM WRECKAGE"}</span>
        <strong>${won ? "藏宝图背面有一行陌生编号" : "残骸里夹着一页未登记档案"}</strong>
        <b>CASE 8</b>
      </button>
    `;
  }

  function resultCollectionMarkup() {
    const update = state.archiveUpdate;
    if (!update) return "";
    const snapshot = update.snapshot;
    const newItems = state.newUnlocks
      .map((id) => snapshot.items.find((item) => item.id === id))
      .filter(Boolean);

    function contacts(level) {
      return `<b class="archive-response__contacts" aria-label="档案响应 ${Math.min(3, level)} / 3">${[1, 2, 3]
        .map((step) => `<i class="${level >= step ? "is-on" : ""}"></i>`)
        .join("")}</b>`;
    }

    function changed(id) {
      return update.responseChanges.some((change) => change.id === id);
    }

    function improved(key) {
      return update.improvements.some((change) => change.key === key);
    }

    if (newItems.length) {
      const names = newItems.map((item) => item.name).join(" · ");
      const secondary = mode === "adventure"
        ? snapshot.items.find((item) => item.id === "question-manuscript")
        : null;
      return `
        <button class="result-collection is-new ${update.completedNow ? "is-complete" : ""} result-collection--${mode}" type="button" data-collection>
          <span>${update.completedNow ? "FILE COMPLETE / 六份档案齐备" : `NEW ARCHIVE / 本次补录 ${newItems.length} 件`}</span>
          <strong>${update.completedNow ? "1953 实验总档已经打开" : names}</strong>
          ${secondary && !secondary.unlocked ? `<em>${secondary.code} · ${secondary.response.label}</em>` : ""}
          <small>打开香农档案柜 · ${snapshot.count} / ${snapshot.total}</small>
        </button>
      `;
    }

    if (mode === "adventure" && state.result.outcome === "captured") {
      const furthest = snapshot.records.furthestMile;
      return `
        <button class="result-collection archive-response ${improved("furthestMile") ? "is-improved" : ""}" type="button" data-collection>
          <span>${improved("furthestMile") ? "NEW LOCAL RECORD / 航迹延长" : "VOYAGE EVIDENCE / 本机航迹"}</span>
          <strong>${improved("furthestMile") ? `最远记录推进到第 ${furthest} 海里` : `本机最远记录仍在第 ${furthest} 海里`}</strong>
          <small>宝藏尚未回收 · 打开档案柜</small>
        </button>
      `;
    }

    let target;
    let recordKey;
    if (mode === "adventure") {
      target = snapshot.items.find((item) => item.id === "question-manuscript");
      recordKey = "minDangerHits";
    } else if (state.result.playerWins > state.result.machineWins) {
      target = snapshot.items.find((item) => item.id === "shannon-breaker");
      recordKey = "duelMinMachineWins";
    } else if (state.result.machineWins > state.result.playerWins) {
      target = snapshot.items.find((item) => item.id === "most-wanted");
      recordKey = "duelMaxMachineWins";
    }

    if (!target) {
      return `
        <button class="result-collection result-collection--duel archive-response is-silent" type="button" data-collection>
          <span>CASE 8 / VALID SAMPLE</span>
          <strong>两枚未署名封条仍然静默</strong>
          <small>第 ${snapshot.records.duelRuns} 份样本已归档 · ${snapshot.count} / ${snapshot.total}</small>
        </button>
      `;
    }

    const response = target.response;
    const isImproved = improved(recordKey) || changed(target.id);
    const confirmation = target.unlocked && response.confirmations > 1
      ? ` · 第 ${response.confirmations} 次确认`
      : "";
    const smartReminder = mode === "duel" && target.id === "shannon-breaker" && !target.unlocked
      ? "聪明蛋不是最后一份档案 · "
      : "";
    return `
      <button class="result-collection result-collection--${mode} archive-response response-level-${response.level} ${isImproved ? "is-improved" : ""}" type="button" data-collection>
        <span>${isImproved ? "ARCHIVE RESPONSE / 响应增强" : "ARCHIVE RESPONSE / 当前信号"}</span>
        ${contacts(response.level)}
        <strong>${target.code} · ${response.label}${confirmation}</strong>
        <small>${smartReminder}${response.evidence || target.hint} · 打开档案柜</small>
      </button>
    `;
  }

  function adventureResult() {
    const won = state.result.outcome === "treasure";
    const tell = tellReport();
    if (won) {
      const treasure = state.result.treasure || Engine.classifyTreasure(state.result.lives, state.result.dangerHits);
      const greeting = escapeHtml(Engine.formatTreasureGreeting(nickname, treasure));
      const voyageProof = treasure.id === "question-manuscript"
        ? `红光锁定 0 次 · 航行 ${ADVENTURE_TOTAL} 海里`
        : `带着 ${state.result.lives} 盏命灯 · 航行 ${ADVENTURE_TOTAL} 海里`;
      return `
        <section class="adventure-result treasure-result treasure-result--${treasure.id}">
          <header><span>SHANNON TREASURE ARCHIVE</span><b>${safeNickname} · 图鉴 ${treasure.archiveNumber} / 04</b></header>
          ${treasureMap(treasure)}
          <div class="treasure-copy"><p>${treasure.rarityLabel} · 图鉴稀有度 ${treasure.rarityLevel} / 4</p><h1>${treasure.name}</h1><strong>${voyageProof}</strong><span>${greeting}</span></div>
          <div class="treasure-seal"><span>稀有</span><strong>${treasure.rarityLevel}/4</strong></div>
          ${resultCollectionMarkup()}
          ${personaMarkup()}
          <p class="share-note">昵称、路线与结局会写进 1080 × 1440 战报图</p>
          ${quickModeButton("relay-speed-toggle--result")}
          <div class="result-action-row result-action-row--adventure"><button class="share-result-button share-result-button--gold" type="button" data-action="share">生成图鉴战报</button><button class="result-restart result-restart--gold" type="button" data-action="restart">再寻一件宝藏</button></div>
          ${researchClue(true)}
        </section>
      `;
    }
    const lossGreeting = escapeHtml(Engine.formatAdventureLossGreeting(nickname, state.result.round));
    return `
      <section class="adventure-result captured-result">
        <header><span>SHANNON STRAIT · INTERCEPTED</span><b>${safeNickname} · ${String(state.result.round).padStart(3, "0")} / ${ADVENTURE_TOTAL}</b></header>
        <div class="wreck-card">
          <div class="wreck-beam"></div>
          <div class="pirate-ship is-wrecked"><i class="sail sail--back"></i><i class="mast"></i><i class="sail sail--front"></i><b></b></div>
          <div class="wreck-bars"><i></i><i></i><i></i><i></i><i></i></div>
          <strong>截获</strong>
        </div>
        <div class="captured-copy"><p>${safeNickname}，三盏命灯全部熄灭</p><h1>海图断在<br>第 ${state.result.round} 海里</h1><span>${lossGreeting}</span></div>
        ${resultCollectionMarkup()}
        ${personaMarkup()}
        ${quickModeButton("relay-speed-toggle--result")}
        <div class="result-action-row result-action-row--adventure"><button class="share-result-button" type="button" data-action="share">生成截获战报</button><button class="result-restart" type="button" data-action="restart">换条路线，再来</button></div>
        ${researchClue(false)}
      </section>
    `;
  }

  function duelBrief() {
    return `
      <section class="duel-shell duel-brief">
        <header class="lab-header"><span>BELL LABS · 1953</span><b>${safeNickname} · 8-CELL</b></header>
        <div class="duel-order is-sealed"><small>未署名档案</small><strong>???</strong><span>触发条件没有写在操作手册里</span></div>
        <h1>你能看懂<br>它在记什么吗？</h1>
        <p class="duel-lead">档案只有 8 组，每组 8 手。每一手，机器都会按“刚才发生了什么”翻开一格，再封存它的猜测。你看得到它翻哪格，看不到格里写了什么。</p>
        <div class="strategy-strip"><span>机器先押</span><i>·</i><span>答案封存</span><i>·</i><span>你再出手</span></div>
        <div class="egg-preview"><i></i><div><small>FINAL TITLE</small><b>人人都是 100% 的某种蛋</b><span>领先、平手和落后会签发不同战报</span></div></div>
        <button class="duel-start" type="button" data-action="begin">接通八格记忆器</button>
        <p class="duel-disclaimer">档案没有解码表。八只格子的灯，就是全部线索。</p>
      </section>
    `;
  }

  function decodeCell(key) {
    const outcome = (letter) => letter === "W" ? "赢" : "输";
    return `${outcome(key[0])}·${key[1] === "S" ? "留" : "换"}·${outcome(key[2])}`;
  }

  function memoryCellsMarkup() {
    const cells = new Map(state.predictor.snapshot().cells.map((cell) => [cell.state, cell]));
    const visitProfile = Engine.summariseShannonVisits(state.records);
    const visits = new Map(visitProfile.entries.map((entry) => [entry.state, entry.count]));
    const maxVisits = Math.max(1, visitProfile.hottest.count);
    return cellOrder.map((key, index) => {
      const cell = cells.get(key);
      const active = state.pending && state.pending.state === key;
      const armed = Boolean(cell && cell.repeated);
      const status = !cell ? "空" : armed ? "已接通" : "记录中";
      const count = visits.get(key);
      const visitWidth = Math.round((count / maxVisits) * 100);
      return `
        <div class="memory-cell ${active ? "is-active" : ""} ${armed ? "is-armed" : ""}" style="--cell-visit:${visitWidth}%" aria-label="${decodeCell(key)}，本局访问 ${count} 次，${status}">
          <span>${String(index + 1).padStart(2, "0")}</span><b>${decodeCell(key)}</b><i></i><small><em>×${String(count).padStart(2, "0")}</em><span>${status}</span></small>
        </div>
      `;
    }).join("");
  }

  function visitProfileMarkup(profile) {
    const maxVisits = Math.max(1, profile.hottest.count);
    const bars = profile.entries.map((entry) => {
      const height = Math.round((entry.count / maxVisits) * 100);
      const tone = entry.state === profile.hottest.state
        ? "is-hot"
        : entry.state === profile.coldest.state
          ? "is-cold"
          : "";
      return `
        <span class="${tone}" aria-label="${decodeCell(entry.state)}访问 ${entry.count} 次">
          <b>${entry.count}</b><i><em style="height:${height}%"></em></i><small>${entry.state}</small>
        </span>
      `;
    }).join("");
    // How readable the player was in each cell — their own transparency. What
    // the cell remembered stays sealed.
    const readable = profile.mostReadable
      ? `<p class="visit-readable">最容易被读穿 <b>${decodeCell(profile.mostReadable.state)}</b> 被抓 <b>${profile.mostReadable.hits} / ${profile.mostReadable.count}</b> 次</p>`
      : "";
    return `
      <section class="visit-profile" aria-label="本局八格访问谱">
        <header><span>YOUR 8-CELL FOOTPRINT</span><b>${profile.total} / ${DUEL_TOTAL - 2} 次有效翻阅</b></header>
        <div class="visit-spectrum">${bars}</div>
        <p>最常进入 <b>${decodeCell(profile.hottest.state)} ×${profile.hottest.count}</b><i>·</i>最少进入 <b>${decodeCell(profile.coldest.state)} ×${profile.coldest.count}</b></p>
        ${readable}
      </section>
    `;
  }

  function duelFeedback() {
    const record = state.last;
    if (!record) {
      return {
        tone: "ready",
        line: "第一手猜测已经封存",
        outcome: "现在选左或右",
        detail: "每一手，它都会先押；你按下后才揭晓",
      };
    }
    return {
      tone: record.correct ? "machine" : "player",
      line: `它押${shortSide(record.predicted)} · 你走${shortSide(record.actual)}`,
      outcome: record.correct ? "它接住了你" : "你骗过了它",
      detail: state.locked
        ? `第 ${String(record.index).padStart(2, "0")} 手正在写入档案`
        : `第 ${String(Math.min(DUEL_TOTAL, record.index + 1)).padStart(2, "0")} 手猜测已封存 · 继续选`,
    };
  }

  function duelFeedbackMarkup(feedback) {
    return `
      <div class="duel-feedback is-${feedback.tone}" aria-live="polite">
        <i></i>
        <div><strong><span>${feedback.line}</span><b>${feedback.outcome}</b></strong><small>${feedback.detail}</small></div>
      </div>
    `;
  }

  function duelGame() {
    const round = state.records.length;
    const machineWins = state.records.filter((record) => record.correct).length;
    const playerWins = round - machineWins;
    const completedBanks = Math.min(DUEL_BANKS, Math.floor(round / DUEL_BANK_SIZE));
    const allBanksComplete = round >= DUEL_TOTAL;
    const currentBank = allBanksComplete ? DUEL_BANKS : completedBanks + 1;
    const handInBank = allBanksComplete ? DUEL_BANK_SIZE : round % DUEL_BANK_SIZE;
    const feedback = duelFeedback();
    return `
      <section class="duel-shell duel-game">
        <header class="lab-header"><span>SHANNON 8-CELL · ${safeNickname}</span><b>${String(round).padStart(2, "0")} / ${DUEL_TOTAL}</b></header>
        <div class="duel-scoreboard">
          <div class="score-tube score-tube--player"><small>你</small><b>${String(playerWins).padStart(3, "0")}</b><span>骗过机器</span></div>
          <div class="score-divider"><i></i><strong>:</strong><i></i></div>
          <div class="score-tube score-tube--machine"><small>香农机</small><b>${String(machineWins).padStart(3, "0")}</b><span>接住你</span></div>
        </div>
        <div class="sealed-file-status">
          <span>RELAY BANK ${String(currentBank).padStart(2, "0")} / ${String(DUEL_BANKS).padStart(2, "0")}</span>
          <b>本组 ${handInBank} / ${DUEL_BANK_SIZE} · 共 ${DUEL_TOTAL} 手后核验</b>
          <div class="relay-bank-progress" aria-label="已封存 ${Math.min(DUEL_BANKS, completedBanks)} / ${DUEL_BANKS} 组">
            ${Array.from({ length: DUEL_BANKS }, (_, index) => `<i class="${index < completedBanks ? "is-complete" : index === currentBank - 1 ? "is-current" : ""}"></i>`).join("")}
          </div>
        </div>
        <div class="memory-rack">
          <header><span>八格记忆器</span><small>亮框=翻阅 · 红灯=有主意 · ×N=访问</small></header>
          <div class="memory-grid">${memoryCellsMarkup()}</div>
        </div>
        ${duelFeedbackMarkup(feedback)}
        <div class="duel-controls">
          <button type="button" data-choice="L" ${state.locked ? "disabled" : ""}><small>L</small><strong>左</strong><span>留，还是换？</span></button>
          <button type="button" data-choice="R" ${state.locked ? "disabled" : ""}><strong>右</strong><span>别让它接住</span><small>R</small></button>
        </div>
        <div class="duel-game__footer">
          <p class="duel-game__note">机器先押且不改答案 · 红灯只显示把握，不泄露方向</p>
          ${quickModeButton("relay-speed-toggle--game")}
          <button type="button" data-action="reset-duel" aria-label="清空比分与八格记忆，重置 CASE 8">重置本局</button>
        </div>
      </section>
    `;
  }

  function eggCopy(result) {
    const { egg, playerWins, machineWins } = result;
    if (egg.tier === "shannon-chosen") {
      return { eyebrow: "SECRET FILE / UNSEALED", title: "你打开了未署名档案", text: `${playerWins}:${machineWins}。这不是普通领先：机器正式签发了“香农破解章”。` };
    }
    if (egg.tier === "shannon-villain") {
      const perfect = playerWins === 0;
      return {
        eyebrow: "SHANNON'S MOST WANTED",
        title: perfect ? "一手都没躲开的传奇" : "机器最喜欢的大坏蛋",
        text: perfect
          ? "64 手，一手都没躲开。能把机器喂得这么饱，也是一种罕见天赋。"
          : `机器以 ${machineWins}:${playerWins} 超过了 2:1。你从另一端撞开了一张隐藏卡。`,
      };
    }
    if (egg.kind === "smart") {
      return { eyebrow: "HUMAN LEADS", title: "这局你赢了香农机", text: `你以 ${playerWins}:${machineWins} 领先。它记住了不少东西，但还是没能追上你。` };
    }
    if (egg.kind === "dumb") {
      return { eyebrow: "MACHINE LEADS", title: "它比你多看懂了一点", text: `机器以 ${machineWins}:${playerWins} 领先。它究竟在八只格子里记了什么？` };
    }
    return { eyebrow: "PERFECT STANDOFF", title: "谁也没读懂谁", text: "32:32。最工整、也最普通的一颗蛋。" };
  }

  function duelResultMarkup() {
    const result = state.result;
    const copy = eggCopy(result);
    const greeting = escapeHtml(Engine.formatEggGreeting(nickname, result.egg));
    const special = result.egg.tier === "shannon-chosen" || result.egg.tier === "shannon-villain";
    const achievement = result.egg.tier === "shannon-chosen"
      ? '<div class="secret-achievement secret-achievement--smart"><span>UNSEALED</span><b>香农破解章</b><small>隐藏条件已核验</small></div>'
      : result.egg.tier === "shannon-villain"
        ? '<div class="secret-achievement secret-achievement--bad"><span>MOST WANTED</span><b>重点观察章</b><small>隐藏条件已核验</small></div>'
        : "";
    return `
      <section class="duel-shell duel-result duel-result--${result.egg.kind}">
        <header class="lab-header"><span>BELL LABS · ${safeNickname}</span><b>${result.playerWins} : ${result.machineWins}</b></header>
        <article class="egg-card ${special ? "is-special" : ""}">
          <p>${copy.eyebrow}</p>
          <div class="egg-object"><i></i><span>${result.egg.percentage}<small>%</small></span></div>
          <h1>${result.egg.label}</h1>
          <h2>${greeting}</h2>
          <p class="egg-copy">${copy.text}</p>
          ${achievement}
          ${resultCollectionMarkup()}
          ${personaMarkup()}
          ${visitProfileMarkup(result.visitProfile)}
          <div class="egg-score"><span>你 <b>${result.playerWins}</b></span><i>:</i><span>机器 <b>${result.machineWins}</b></span></div>
          <footer><span>8 × 8 手 · 本机计算</span><span>未联网 / 未上传</span></footer>
        </article>
        ${quickModeButton("relay-speed-toggle--result")}
        <div class="result-action-row"><button class="share-result-button share-result-button--duel" type="button" data-action="share">生成严选战报</button><button class="result-restart result-restart--duel" type="button" data-action="restart">重新挑战香农</button></div>
      </section>
    `;
  }

  function canvasFont(size, options = {}) {
    const weight = options.weight || 400;
    const family = options.mono
      ? 'ui-monospace, "SFMono-Regular", Consolas, monospace'
      : options.serif
        ? 'Georgia, "Songti SC", "Noto Serif CJK SC", serif'
        : '"Arial Narrow", "PingFang SC", "Noto Sans CJK SC", sans-serif';
    return `${weight} ${size}px ${family}`;
  }

  function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const glyphs = Array.from(text);
    const lines = [];
    let line = "";
    for (const glyph of glyphs) {
      const candidate = line + glyph;
      if (line && context.measureText(candidate).width > maxWidth) {
        if (lines.length === maxLines - 1) {
          let clipped = line;
          while (clipped && context.measureText(`${clipped}…`).width > maxWidth) {
            clipped = clipped.slice(0, -1);
          }
          lines.push(`${clipped}…`);
          line = "";
          break;
        }
        lines.push(line);
        line = glyph;
      } else {
        line = candidate;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    lines.slice(0, maxLines).forEach((current, index) => {
      context.fillText(current, x, y + index * lineHeight);
    });
    return y + lines.length * lineHeight;
  }

  function drawCardGrid(context, colour, spacing = 48) {
    context.save();
    context.strokeStyle = colour;
    context.lineWidth = 1;
    for (let value = 0; value <= 1080; value += spacing) {
      context.beginPath();
      context.moveTo(value, 0);
      context.lineTo(value, 1440);
      context.stroke();
    }
    for (let value = 0; value <= 1440; value += spacing) {
      context.beginPath();
      context.moveTo(0, value);
      context.lineTo(1080, value);
      context.stroke();
    }
    context.restore();
  }

  /*
   * The behavioural title gets its own card rather than a line on the egg's.
   *
   * The egg is the punchline and wants a clean canvas; this is the depth, for
   * whoever asks "why". Given the whole 1080x1440 it can show every axis that
   * fired with the numbers that earned it, instead of the single cramped line
   * that was colliding with the footprint.
   */
  function drawPersonaShare(context, accent) {
    const persona = Engine.classifyPersona(state.records);
    const tell = tellReport();
    context.fillStyle = "#061923";
    context.fillRect(0, 0, 1080, 1440);
    drawCardGrid(context, "rgba(118,247,176,0.045)", 54);
    drawShareHeader(context, "BEHAVIOURAL PROFILE / 1953", true);

    context.strokeStyle = persona.unread ? "#4f9f78" : accent;
    context.lineWidth = 6;
    context.strokeRect(78, 185, 924, 1190);

    /*
     * The card is laid out from its content rather than from fixed marks.
     * 63% of players light one of the four axes and 32% light two, so a fixed
     * grid built for four rows left a single finding stranded in an empty box.
     * Sparse cards get a bigger name — with little evidence to show, the name is
     * the content — and the whole stack is centred so either extreme reads as a
     * deliberate poster.
     */
    const rows = persona.unread ? 0 : Math.min(4, persona.axes.length);
    const nameSize = rows <= 1 ? 132 : rows === 2 ? 116 : 96;
    const ROW_STRIDE = 104;

    // One set of offsets drives both the height measurement and the drawing, so
    // the two can never drift apart and leave the block off-centre.
    const CALLSIGN = 30;
    const NAME = CALLSIGN + 40 + Math.round(nameSize * 0.78);
    const NAME_BOTTOM = NAME + Math.round(nameSize * 0.26);
    const COUNT = NAME_BOTTOM + 56;
    const DIVIDER = COUNT + 34;
    const BODY = DIVIDER + 78;
    const bodyHeight = rows ? (rows - 1) * ROW_STRIDE + 50 : 122;
    // Optically centred, not geometrically: a block sitting on the exact centre
    // of a tall frame reads as low, because the eye expects content sooner
    // after the top border.
    const top = 185 + Math.max(0, (1190 - (BODY + bodyHeight)) * 0.42);

    context.textAlign = "center";
    context.fillStyle = accent;
    context.font = canvasFont(23, { mono: true, weight: 700 });
    context.fillText(`CALLSIGN / ${nickname}`, 540, top + CALLSIGN);

    context.fillStyle = persona.unread ? "#76f7b0" : "#f4dcae";
    context.font = canvasFont(nameSize, { serif: true, weight: 700 });
    drawWrappedText(context, persona.name, 540, top + NAME, 880, Math.round(nameSize * 1.12), 1);

    context.fillStyle = accent;
    context.font = canvasFont(24, { mono: true, weight: 700 });
    context.fillText(
      persona.sealed ? `${persona.sealed} 项经机器核验` : "本局打法记录",
      540,
      top + COUNT,
    );

    const dividerY = top + DIVIDER;
    context.strokeStyle = "rgba(118,247,176,0.3)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(160, dividerY);
    context.lineTo(920, dividerY);
    context.stroke();

    if (persona.unread) {
      context.fillStyle = "#d7e1db";
      context.font = canvasFont(31, { serif: true, weight: 700 });
      const after = drawWrappedText(context, tell.report.headline, 540, top + BODY, 860, 44, 2);
      context.fillStyle = "#a8bbb1";
      context.font = canvasFont(21, { mono: true });
      drawWrappedText(context, tell.report.detail, 540, after + 20, 880, 30, 2);
    }

    /*
     * Only the axes that fired. The "N / 4 项读到" line above already discloses
     * that four tests ran, so listing the misses would spend most of the card
     * saying "nothing found here" — thin for something meant to be shared. The
     * full four-row breakdown stays on the result screen, which is where two
     * runs actually get compared.
     */
    let y = top + BODY;
    persona.axes.slice(0, 4).forEach((axis) => {
      context.textAlign = "left";
      // A filled mark is a sealed axis; a hollow one is this run's figure only.
      context.fillStyle = axis.sealed ? accent : "#4f6a62";
      context.font = canvasFont(30, { mono: true, weight: 700 });
      context.fillText(axis.sealed ? "\u25cf" : "\u25cb", 150, y);
      context.fillStyle = axis.sealed ? "#f1e6cd" : "#c3d2ca";
      context.font = canvasFont(31, { serif: true, weight: 700 });
      const after = drawWrappedText(context, axis.headline, 196, y, 748, 42, 2);
      context.fillStyle = "#9db5ad";
      context.font = canvasFont(21, { mono: true });
      drawWrappedText(context, axis.detail, 196, after + 8, 790, 30, 1);
      y = after + (ROW_STRIDE - 42);
    });

    context.textAlign = "left";
    context.fillStyle = "#69837b";
    context.font = canvasFont(18, { mono: true });
    context.fillText(`${state.records.length} MOVES / GENERATED LOCALLY / NOT UPLOADED`, 78, 1420);
  }

  function drawShareHeader(context, label, dark = true) {
    context.fillStyle = dark ? "#76f7b0" : "#173b39";
    context.font = canvasFont(25, { mono: true, weight: 700 });
    context.textAlign = "left";
    context.fillText("BELL TELEPHONE LABORATORIES", 78, 83);
    context.textAlign = "right";
    context.fillText("1953 / OFFLINE", 1002, 83);
    context.strokeStyle = dark ? "#4f9f78" : "#536f62";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(78, 109);
    context.lineTo(1002, 109);
    context.stroke();
    context.textAlign = "left";
    context.fillStyle = dark ? "#ffb84a" : "#a54235";
    context.font = canvasFont(20, { mono: true, weight: 700 });
    context.fillText(label, 78, 148);
  }

  function archiveShareSummary() {
    const update = state.archiveUpdate;
    const snapshot = update ? update.snapshot : collection.snapshot();
    const improvements = update ? update.improvements : [];
    const improved = (key) => improvements.some((change) => change.key === key);
    let label = update && update.completedNow
      ? "FILE COMPLETE / 六份齐备"
      : update && update.newUnlocks.length
        ? `NEW ARCHIVE / +${update.newUnlocks.length}`
        : "LOCAL ARCHIVE / 本机档案";
    let evidence;

    if (mode === "adventure") {
      if (state.result.outcome === "captured") {
        if (improved("furthestMile")) label = "NEW LOCAL RECORD / 航迹延长";
        evidence = `本机最远第 ${snapshot.records.furthestMile} 海里`;
      } else {
        if (!update.completedNow && !update.newUnlocks.length && improved("minDangerHits")) {
          label = "NEW LOCAL RECORD / 红光减少";
        }
        evidence = snapshot.records.minDangerHits === null
          ? "尚无完整航迹"
          : `本机最少红光 ${snapshot.records.minDangerHits} 次`;
      }
      return { label, evidence, count: snapshot.count, response: null };
    }

    let target = null;
    if (state.result.playerWins > state.result.machineWins) {
      target = snapshot.items.find((item) => item.id === "shannon-breaker");
    } else if (state.result.machineWins > state.result.playerWins) {
      target = snapshot.items.find((item) => item.id === "most-wanted");
    }
    if (!target) {
      return {
        label: "CASE 8 / VALID SAMPLE",
        evidence: `两枚封条静默 · 第 ${snapshot.records.duelRuns} 份样本`,
        count: snapshot.count,
        response: null,
      };
    }
    if (!update.completedNow && !update.newUnlocks.length && update.responseChanges.some((change) => change.id === target.id)) {
      label = "ARCHIVE RESPONSE / 响应增强";
    }
    return {
      label,
      evidence: `${target.code} · ${target.response.label} · ${target.response.evidence}`,
      count: snapshot.count,
      response: target.response,
    };
  }

  function drawArchiveShareBand(context, y, options = {}) {
    const summary = archiveShareSummary();
    const dark = options.dark !== false;
    const accent = options.accent || (dark ? "#76f7b0" : "#a54235");
    const x = options.x || 78;
    const width = options.width || 924;
    context.fillStyle = dark ? "rgba(118,247,176,0.045)" : "rgba(255,255,255,0.11)";
    context.fillRect(x, y, width, 74);
    context.strokeStyle = dark ? "rgba(118,247,176,0.42)" : "rgba(23,59,57,0.46)";
    context.lineWidth = 2;
    context.strokeRect(x, y, width, 74);
    context.fillStyle = accent;
    context.font = canvasFont(17, { mono: true, weight: 700 });
    context.textAlign = "left";
    context.fillText(summary.label, x + 18, y + 25);
    context.textAlign = "right";
    context.fillText(`ARCHIVE ${summary.count} / 6`, x + width - 18, y + 25);
    context.fillStyle = dark ? "#d7e1db" : "#173b39";
    context.font = canvasFont(23, { serif: true, weight: 700 });
    context.textAlign = "left";
    context.fillText(summary.evidence, x + 18, y + 56);
  }

  function drawAdventureShare(context) {
    const won = state.result.outcome === "treasure";
    const treasure = won
      ? state.result.treasure || Engine.classifyTreasure(state.result.lives, state.result.dangerHits)
      : null;
    context.fillStyle = won ? "#d7c38d" : "#061923";
    context.fillRect(0, 0, 1080, 1440);
    drawCardGrid(context, won ? "rgba(23,59,57,0.09)" : "rgba(118,247,176,0.045)", 54);
    drawShareHeader(context, won ? "MISSION A / TREASURE FOUND" : "MISSION A / INTERCEPTED", !won);

    if (won) {
      context.save();
      context.strokeStyle = "#244d48";
      context.lineWidth = 5;
      context.strokeRect(78, 185, 924, 720);
      context.fillStyle = "rgba(42,84,70,0.12)";
      context.beginPath();
      context.ellipse(765, 732, 170, 105, 0.12, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.setLineDash([18, 20]);
      context.strokeStyle = "#b13e32";
      context.lineWidth = 9;
      context.beginPath();
      context.moveTo(165, 278);
      context.bezierCurveTo(80, 480, 460, 474, 312, 650);
      context.bezierCurveTo(250, 724, 570, 700, 726, 764);
      context.stroke();
      context.setLineDash([]);
      context.strokeStyle = "#b13e32";
      context.lineWidth = 16;
      context.beginPath();
      context.moveTo(748, 710);
      context.lineTo(825, 790);
      context.moveTo(825, 710);
      context.lineTo(748, 790);
      context.stroke();
      context.fillStyle = "#173b39";
      context.font = canvasFont(21, { mono: true });
      context.fillText("SHANNON LIGHT", 112, 240);
      context.fillStyle = "#9e342b";
      context.fillText("TREASURE", 830, 844);

      context.translate(786, 785);
      if (treasure.id === "ember-coins") {
        [[-68, 20], [-25, -9], [24, 18], [61, -16]].forEach(function drawCoin(position, index) {
          context.fillStyle = index % 2 ? "#f5ca58" : "#dda632";
          context.strokeStyle = "#6e4125";
          context.lineWidth = 7;
          context.beginPath();
          context.ellipse(position[0], position[1], 38, 25, -0.18, 0, Math.PI * 2);
          context.fill();
          context.stroke();
        });
      } else if (treasure.id === "relay-compass") {
        context.fillStyle = "#d9b858";
        context.strokeStyle = "#244d48";
        context.lineWidth = 10;
        context.beginPath();
        context.arc(0, 0, 82, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.fillStyle = "#a53f34";
        context.beginPath();
        context.moveTo(0, -62);
        context.lineTo(23, 20);
        context.lineTo(0, 7);
        context.lineTo(-23, 20);
        context.closePath();
        context.fill();
        context.stroke();
      } else if (treasure.id === "shannon-key") {
        context.strokeStyle = "#244d48";
        context.fillStyle = "#efc75d";
        context.lineWidth = 12;
        context.beginPath();
        context.arc(-58, -25, 43, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.fillRect(-20, -37, 132, 25);
        context.strokeRect(-20, -37, 132, 25);
        context.fillRect(72, -12, 25, 45);
        context.fillRect(102, -12, 25, 30);
      } else {
        context.fillStyle = "#dfca91";
        context.strokeStyle = "#6d4d28";
        context.lineWidth = 7;
        context.fillRect(-63, -76, 126, 152);
        context.strokeRect(-63, -76, 126, 152);
        context.strokeStyle = "#86704a";
        context.lineWidth = 3;
        for (let y = -48; y <= 22; y += 18) {
          context.beginPath();
          context.moveTo(-42, y);
          context.lineTo(38, y);
          context.stroke();
        }
        context.fillStyle = "#a33e32";
        context.font = canvasFont(86, { serif: true, weight: 700 });
        context.textAlign = "center";
        context.fillText("?", 36, 72);
      }
      context.restore();

      context.fillStyle = "#9f382f";
      context.font = canvasFont(24, { mono: true, weight: 700 });
      context.textAlign = "center";
      context.fillText(`${nickname} / TREASURE ARCHIVE ${treasure.archiveNumber} OF 04`, 540, 955);
      context.fillStyle = "#162d2b";
      context.font = canvasFont(70, { serif: true, weight: 700 });
      context.fillText(treasure.name, 540, 1025);
      context.font = canvasFont(28, { weight: 700 });
      const proof = treasure.id === "question-manuscript"
        ? `${treasure.rarityLabel} · 稀有等级 ${treasure.rarityLevel} / 4 · 红光锁定 0 次`
        : `${treasure.rarityLabel} · 稀有等级 ${treasure.rarityLevel} / 4 · ${state.result.lives} 盏命灯`;
      context.fillText(proof, 540, 1078);
      context.font = canvasFont(26, { serif: true, weight: 700 });
      drawWrappedText(context, Engine.formatTreasureGreeting(nickname, treasure), 540, 1125, 840, 38, 2);
    } else {
      context.save();
      const beam = context.createLinearGradient(540, 160, 540, 930);
      beam.addColorStop(0, "rgba(239,78,69,0.84)");
      beam.addColorStop(1, "rgba(239,78,69,0.08)");
      context.fillStyle = beam;
      context.beginPath();
      context.moveTo(470, 185);
      context.lineTo(610, 185);
      context.lineTo(930, 930);
      context.lineTo(150, 930);
      context.closePath();
      context.fill();
      context.strokeStyle = "#ef665c";
      context.lineWidth = 14;
      for (let x = 230; x <= 850; x += 155) {
        context.beginPath();
        context.moveTo(x, 300);
        context.lineTo(x, 880);
        context.stroke();
      }
      context.strokeRect(200, 300, 680, 580);
      context.translate(540, 600);
      context.rotate(-0.09);
      context.fillStyle = "#8f2d28";
      context.fillRect(-150, -62, 300, 124);
      context.strokeStyle = "#ffac9c";
      context.lineWidth = 8;
      context.strokeRect(-150, -62, 300, 124);
      context.fillStyle = "#fff0d4";
      context.font = canvasFont(63, { serif: true, weight: 700 });
      context.textAlign = "center";
      context.fillText("截 获", 0, 20);
      context.restore();

      context.fillStyle = "#ef6a5f";
      context.font = canvasFont(23, { mono: true, weight: 700 });
      context.textAlign = "center";
      context.fillText(`${nickname} / SIGNAL LOST`, 540, 990);
      context.fillStyle = "#e6e0c8";
      context.font = canvasFont(70, { serif: true, weight: 700 });
      context.fillText(`海图断在第 ${state.result.round} 海里`, 540, 1070);
      context.fillStyle = "#a8bbb1";
      context.font = canvasFont(26, { serif: true });
      drawWrappedText(context, Engine.formatAdventureLossGreeting(nickname, state.result.round), 540, 1125, 840, 38, 2);
    }

    drawArchiveShareBand(context, 1260, {
      dark: !won,
      accent: won ? "#a54235" : "#ef665c",
    });
    context.textAlign = "left";
    context.fillStyle = won ? "#4f665c" : "#69837b";
    context.font = canvasFont(18, { mono: true });
    const voyageLength = won ? ADVENTURE_TOTAL : state.result.round;
    context.fillText(`${voyageLength} MOVES / GENERATED LOCALLY / NOT UPLOADED`, 78, 1382);
  }

  function drawDuelVisitSpectrum(context, profile, y, accent, score) {
    const maxVisits = Math.max(1, profile.hottest.count);
    const startX = 190;
    const barWidth = 58;
    const gap = 31;
    // Header at y, counts at y+34, bars y+40..y+80, cell names at y+98. The
    // header and the counts used to sit 12px apart and overlapped.
    const barTop = y + 40;
    const baseline = barTop + 40;
    context.textAlign = "left";
    context.fillStyle = "#76f7b0";
    context.font = canvasFont(18, { mono: true, weight: 700 });
    context.fillText(`YOUR 8-CELL FOOTPRINT / ${profile.total} OF ${DUEL_TOTAL - 2}`, startX, y);
    // The score rides on the footprint header rather than claiming its own
    // line — the tell block above is worth more of the remaining height.
    context.textAlign = "right";
    context.fillStyle = "#d7e1db";
    context.font = canvasFont(22, { mono: true, weight: 700 });
    context.fillText(score, 890, y);

    profile.entries.forEach((entry, index) => {
      const x = startX + index * (barWidth + gap);
      const height = Math.max(3, Math.round((entry.count / maxVisits) * 40));
      const isHot = entry.state === profile.hottest.state;
      const isCold = entry.state === profile.coldest.state;
      context.fillStyle = "rgba(118,247,176,0.07)";
      context.fillRect(x, barTop, barWidth, 40);
      context.fillStyle = isHot ? accent : isCold ? "#58736a" : "#4f9f78";
      context.fillRect(x + 5, baseline - height, barWidth - 10, height);
      context.textAlign = "center";
      context.fillStyle = isHot ? accent : "#b8c9c2";
      context.font = canvasFont(16, { mono: true, weight: isHot ? 700 : 400 });
      context.fillText(String(entry.count), x + barWidth / 2, y + 34);
      context.fillStyle = isHot ? accent : "#8da49b";
      context.font = canvasFont(15, { mono: true, weight: 700 });
      context.fillText(entry.state, x + barWidth / 2, y + 98);
    });
  }

  function drawDuelShare(context) {
    const result = state.result;
    const { egg } = result;
    const smart = egg.kind === "smart";
    const bad = egg.kind === "bad";
    const dumb = egg.kind === "dumb";
    const secretFile = egg.tier === "shannon-chosen" || egg.tier === "shannon-villain";
    const accent = bad ? "#ef665c" : smart ? "#ffb84a" : dumb ? "#9fc5b7" : "#76f7b0";
    const titleColour = bad ? "#ff9b8e" : smart ? "#f2d47e" : "#e6e0c8";
    context.fillStyle = "#061923";
    context.fillRect(0, 0, 1080, 1440);
    drawCardGrid(context, "rgba(118,247,176,0.045)", 54);
    drawShareHeader(context, "MISSION B / SHANNON SELECTS", true);

    context.fillStyle = "rgba(3,17,23,0.72)";
    context.fillRect(81, 188, 918, 1184);
    context.strokeStyle = "#4f9f78";
    context.lineWidth = 6;
    context.strokeRect(78, 185, 924, 1190);
    const eggGradient = context.createRadialGradient(420, 400, 35, 540, 565, 280);
    eggGradient.addColorStop(0, bad ? "#ffc2b5" : smart ? "#fff1b7" : dumb ? "#dceadf" : "#d7ffe8");
    eggGradient.addColorStop(0.55, bad ? "#c14d42" : smart ? "#e8ae3b" : dumb ? "#77988d" : "#71c798");
    eggGradient.addColorStop(1, bad ? "#57231f" : smart ? "#684315" : dumb ? "#29483f" : "#1c4b3c");
    context.fillStyle = eggGradient;
    context.shadowColor = accent;
    context.shadowBlur = 28;
    context.beginPath();
    context.moveTo(540, 248);
    context.bezierCurveTo(715, 257, 787, 505, 738, 656);
    context.bezierCurveTo(697, 779, 383, 779, 342, 656);
    context.bezierCurveTo(293, 505, 365, 257, 540, 248);
    context.closePath();
    context.fill();
    context.shadowBlur = 0;
    context.strokeStyle = accent;
    context.lineWidth = 9;
    context.stroke();

    context.save();
    context.globalAlpha = 0.12;
    context.strokeStyle = "#031117";
    context.lineWidth = 2;
    for (let y = 290; y <= 716; y += 12) {
      context.beginPath();
      context.moveTo(350, y);
      context.lineTo(730, y);
      context.stroke();
    }
    context.restore();

    context.fillStyle = "#031117";
    context.textAlign = "center";
    context.font = canvasFont(108, { mono: true, weight: 700 });
    context.fillText(`${egg.percentage}%`, 540, 553);
    context.fillStyle = accent;
    context.font = canvasFont(23, { mono: true, weight: 700 });
    context.fillText(`CALLSIGN / ${nickname}`, 540, 810);
    context.fillStyle = titleColour;
    context.font = canvasFont(74, { serif: true, weight: 700 });
    context.fillText(egg.label, 540, 882);
    context.fillStyle = accent;
    context.font = canvasFont(26, { serif: true, weight: 700 });
    drawWrappedText(context, Engine.formatEggGreeting(nickname, egg), 540, 934, 880, 38, 2);

    if (secretFile) {
      context.strokeStyle = accent;
      context.lineWidth = 3;
      context.strokeRect(300, 1030, 480, 52);
      context.fillStyle = accent;
      context.font = canvasFont(22, { mono: true, weight: 700 });
      context.fillText(
        egg.tier === "shannon-chosen" ? "UNSEALED / 香农破解章" : "MOST WANTED / 重点观察章",
        540,
        1064,
      );
    }

    drawArchiveShareBand(context, 1122, { dark: true, accent, x: 190, width: 700 });

    // The card bottom is a fixed budget: the tell block needs ~120px and the
    // footprint ~116px, and the achievement plate eats 52 of them when present.
    drawDuelVisitSpectrum(
      context,
      result.visitProfile,
      secretFile ? 1258 : 1240,
      accent,
      `你 ${result.playerWins} : ${result.machineWins} 香农机`,
    );
  }

  function personaAccent() {
    if (mode === "adventure") return state.result.outcome === "treasure" ? "#ffb84a" : "#ef665c";
    const { egg } = state.result;
    return egg.kind === "bad" ? "#ef665c" : egg.kind === "smart" ? "#ffb84a" : egg.kind === "dumb" ? "#9fc5b7" : "#76f7b0";
  }

  function createShareDataUrl(kind) {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1440;
    const context = canvas.getContext("2d");
    context.textBaseline = "alphabetic";
    if (kind === "persona") drawPersonaShare(context, personaAccent());
    else if (mode === "adventure") drawAdventureShare(context);
    else drawDuelShare(context);
    return canvas.toDataURL("image/png");
  }

  async function saveShareImage(dataUrl, status, button) {
    const bridge = window.xhs && window.xhs.miniTool;
    if (
      !bridge
      || typeof bridge.writeTempFile !== "function"
      || typeof bridge.saveImageToPhotosAlbum !== "function"
    ) {
      status.textContent = "当前环境没有相册能力，请使用系统截图。";
      return;
    }

    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "保存中…";
    status.textContent = "正在生成临时图片…";
    try {
      const temporary = await window.xhs.miniTool.writeTempFile({ data: dataUrl });
      if (!temporary || typeof temporary.filePath !== "string" || !temporary.filePath) {
        throw new Error("writeTempFile returned no filePath");
      }
      status.textContent = "正在写入系统相册…";
      await window.xhs.miniTool.saveImageToPhotosAlbum({ filePath: temporary.filePath });
      status.textContent = "已保存到系统相册。";
    } catch (_error) {
      status.textContent = "保存失败，请允许相册权限后重试，或使用系统截图。";
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  /*
   * Two cards, not one. The result card is the punchline and is what most
   * people will save; the behavioural profile is the follow-up for whoever
   * wants to know why. Both are generated on demand so a player who never opens
   * the second tab never pays for it.
   */
  function showShareCard() {
    if (state.screen !== "result") return;
    const previousModal = document.querySelector(".share-card-modal");
    if (previousModal) previousModal.remove();
    const previousFocus = document.activeElement;

    const cards = {
      result: { label: mode === "adventure" ? "战报" : "严选战报", url: null },
      persona: { label: "行为称号", url: null },
    };
    const urlFor = (kind) => {
      if (!cards[kind].url) cards[kind].url = createShareDataUrl(kind);
      return cards[kind].url;
    };
    let active = "result";

    const modal = document.createElement("div");
    modal.className = "share-card-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "结果战报预览");
    modal.innerHTML = `
      <div class="share-card-modal__panel">
        <header><div><small>FINAL TRANSMISSION</small><strong>${safeNickname} 的战报</strong></div><button type="button" data-close-share aria-label="关闭预览">×</button></header>
        <nav class="share-card-tabs" role="tablist">
          <button type="button" role="tab" data-card="result" aria-selected="true">${cards.result.label}</button>
          <button type="button" role="tab" data-card="persona" aria-selected="false">${cards.persona.label}</button>
        </nav>
        <img src="${urlFor("result")}" alt="${safeNickname} 的 1080 × 1440 游戏结果图">
        <footer><span data-save-status aria-live="polite">点击保存到系统相册</span><button type="button" data-save-share>保存到相册</button></footer>
      </div>
    `;
    document.body.append(modal);

    const image = modal.querySelector("img");
    const saveButton = modal.querySelector("[data-save-share]");
    const saveStatus = modal.querySelector("[data-save-status]");
    const close = () => {
      modal.remove();
      if (previousFocus && document.documentElement.contains(previousFocus)) previousFocus.focus();
    };

    modal.querySelectorAll("[data-card]").forEach((tab) => {
      tab.addEventListener("click", () => {
        active = tab.dataset.card;
        modal.querySelectorAll("[data-card]").forEach((other) => {
          other.setAttribute("aria-selected", String(other === tab));
        });
        image.src = urlFor(active);
        image.alt = `${safeNickname} 的 ${cards[active].label} · 1080 × 1440`;
        saveStatus.textContent = "点击保存到系统相册";
      });
    });

    modal.querySelector("[data-close-share]").addEventListener("click", close);
    modal.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
    saveButton.addEventListener("click", () => saveShareImage(urlFor(active), saveStatus, saveButton));
    modal.querySelector("[data-close-share]").focus();
  }

  function render() {
    let content;
    if (mode === "adventure") {
      if (state.screen === "brief") content = adventureBrief();
      else if (state.screen === "play") content = adventureGame();
      else content = adventureResult();
    } else if (state.screen === "brief") content = duelBrief();
    else if (state.screen === "play") content = duelGame();
    else content = duelResultMarkup();

    root.className = `two-mode-prototype mode-${mode}`;
    root.innerHTML = `${content}${modeSwitcher()}`;

    root.querySelectorAll("[data-switch]").forEach((button) => {
      button.addEventListener("click", () => switchMode(button.dataset.switch));
    });
    const homeButton = root.querySelector("[data-home]");
    const beginButton = root.querySelector('[data-action="begin"]');
    const restartButton = root.querySelector('[data-action="restart"]');
    const resetDuelButton = root.querySelector('[data-action="reset-duel"]');
    const researchButton = root.querySelector('[data-action="research"]');
    const shareButton = root.querySelector('[data-action="share"]');
    const speedButton = root.querySelector('[data-action="toggle-speed"]');
    if (homeButton) homeButton.addEventListener("click", goHome);
    if (beginButton) beginButton.addEventListener("click", begin);
    if (restartButton) restartButton.addEventListener("click", restart);
    if (resetDuelButton) resetDuelButton.addEventListener("click", resetDuel);
    if (researchButton) researchButton.addEventListener("click", enterResearchRoom);
    if (shareButton) shareButton.addEventListener("click", showShareCard);
    if (speedButton) speedButton.addEventListener("click", toggleQuickMode);
    root.querySelectorAll("[data-collection]").forEach((button) => {
      button.addEventListener("click", openCollectionCabinet);
    });
    root.querySelectorAll("[data-choice]").forEach((button) => {
      button.addEventListener("click", () => choose(button.dataset.choice));
    });
  }

  function handleGlobalKeydown(event) {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (document.querySelector(".collection-cabinet-modal, .share-card-modal")) return;
    if (event.key === "ArrowLeft" && state.screen === "play") choose(Engine.LEFT);
    if (event.key === "ArrowRight" && state.screen === "play") choose(Engine.RIGHT);
  }

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    renderToken += 1;
    window.removeEventListener("keydown", handleGlobalKeydown);
    const shareModal = document.querySelector(".share-card-modal");
    if (shareModal) shareModal.remove();
    if (typeof miniTool.closeCollectionCabinet === "function") miniTool.closeCollectionCabinet();
    root.remove();
    document.body.classList.remove("two-mode-prototype-mode");
    if (audioContext && typeof audioContext.close === "function") {
      try {
        const closing = audioContext.close();
        if (closing && typeof closing.catch === "function") closing.catch(() => {});
      } catch (_error) {
        // Audio is optional and may already have been closed by the WebView.
      }
    }
    if (activeCleanup === dispose) activeCleanup = null;
  }

  window.addEventListener("keydown", handleGlobalKeydown);
  activeCleanup = dispose;

  // Opt-in inspection hook for local regression screenshots. Never exposed in
  // the ordinary experience, and it performs no I/O.
  if (params.get("qa") === "1") {
    window.__twoModePrototype = Object.freeze({
      begin,
      choose,
      restart,
      resetDuel,
      getState: () => state,
    });
  }

  render();
  }

  const miniTool = window.ShannonMiniTool || {};
  window.ShannonMiniTool = miniTool;
  miniTool.startMode = startTwoModePrototype;

  const initialMode = new URLSearchParams(window.location.search).get("variant");
  if (MODES.includes(initialMode)) startTwoModePrototype();
})();
