/*
 * Unified product entry. It owns the query-less route and ?variant=hub,
 * then launches either game in the same document. No persistence, network
 * access, remote assets, or full-page navigation are used.
 */
(function installUnifiedEntry() {
  "use strict";

  const Engine = window.MindReader;
  if (!Engine) return;
  const miniTool = window.ShannonMiniTool || {};
  window.ShannonMiniTool = miniTool;

  function markFlexGapSupport() {
    if (!document.body || document.documentElement.classList.contains("supports-flex-gap")) return;
    const flex = document.createElement("div");
    flex.style.position = "absolute";
    flex.style.visibility = "hidden";
    flex.style.display = "flex";
    flex.style.flexDirection = "column";
    flex.style.rowGap = "1px";
    flex.appendChild(document.createElement("div"));
    flex.appendChild(document.createElement("div"));
    document.body.appendChild(flex);
    const supported = flex.scrollHeight === 1;
    flex.parentNode.removeChild(flex);
    if (supported) document.documentElement.classList.add("supports-flex-gap");
  }

  markFlexGapSupport();

  function showUnifiedEntry(options = {}) {
    const params = new URLSearchParams(window.location.search);
    const previousEntry = document.querySelector("#unifiedEntry");
    const previousModal = document.querySelector(".share-card-modal");
    if (previousEntry) previousEntry.remove();
    if (previousModal) previousModal.remove();
    document.body.classList.remove("two-mode-prototype-mode");

    const root = document.createElement("main");
    root.id = "unifiedEntry";
    root.className = "unified-entry";
    document.body.classList.add("unified-entry-mode");
    document.body.append(root);

  const relayCells = Array.from({ length: 8 }, (_, index) => (
    `<i style="--relay-index:${index}" aria-hidden="true"><span>${String(index + 1).padStart(2, "0")}</span></i>`
  )).join("");
  const tapeHoles = Array.from({ length: 23 }, () => "<i></i>").join("");

  root.innerHTML = `
    <div class="entry-noise" aria-hidden="true"></div>
    <header class="entry-topbar">
      <div><i></i><span>BELL TELEPHONE LABORATORIES</span></div>
      <span>OFFLINE SIGNAL / 1953—NOW</span>
    </header>

    <section class="entry-hero" aria-labelledby="entryTitle">
      <div class="hero-date" aria-hidden="true"><span>19</span><span>53</span></div>
      <div class="relay-oracle" aria-hidden="true">
        <div class="relay-oracle__cells">${relayCells}</div>
        <div class="relay-oracle__eye"><i></i><span>?</span></div>
        <div class="relay-oracle__sweep"></div>
        <small>MIND-READING (?) MACHINE</small>
      </div>
      <div class="hero-copy">
        <p>SHANNON MIND-READING (?) MACHINE / 1953</p>
        <h1 id="entryTitle">逃过一台<br><em>1953 年的<br>读心机。</em></h1>
        <p class="hero-lead">它已经先押好了。你有三盏命灯和 100 海里。出手前先看灯塔：灯亮，说明它认得这个局面。</p>
        <div class="hero-launch">
          <label for="callsignInput"><span>船长呼号 / 可选</span><div><b>&gt;</b><input id="callsignInput" type="text" maxlength="24" inputmode="text" autocomplete="off" spellcheck="false" placeholder="不填则使用匿名船长"></div><small><i id="callsignCount">00</i> / 12 · 只写进本机战报</small></label>
          <button class="adventure-entry" type="button" data-launch="adventure"><span>扬帆进入香农海峡</span><small>机器的第一次搜索已经封存</small></button>
          <button class="case-eight-entry" type="button" data-launch="duel" aria-label="直接进入 CASE 8 八格研究室，共 64 手">
            <b aria-hidden="true">08</b>
            <span><small>CASE 8 / 实验人员入口</small><strong>直接研究八格机器</strong></span>
            <em>64 手 · 攻略封存</em>
          </button>
          <p><b>机器先押</b><i></i><b>你选左右</b><i></i><b>三次红色命中夺命</b></p>
        </div>
      </div>
      <a class="signal-descent" href="#archive"><span>先看 1953 档案</span><i></i></a>
    </section>

    <div class="punch-tape" aria-hidden="true"><span>${tapeHoles}</span><b>1953 · HUMAN INPUT · 100 BITS · RESULT SEALED</b></div>

    <div class="entry-circuit">
      <section class="entry-section briefing-section" id="archive" aria-labelledby="historyTitle">
        <div class="section-index"><b>1953</b><span>原始档案</span></div>
        <div class="history-copy">
          <p class="section-kicker">THE ORIGINAL QUESTION</p>
          <h2 id="historyTitle">它不读心，<br>只记得你。</h2>
          <p>Claude Shannon 在贝尔实验室记录了这台机器。你反复选择左或右；它把最近的输赢和留、换反应写进八只记忆格，并且永远先于你封存下一次猜测。</p>
          <blockquote><span>没有问卷，也没有 AI API。</span><strong>输赢由你刚才的选择当场核验。</strong></blockquote>
        </div>
        <div class="archive-plate" aria-label="八格记忆器示意图">
          <header><span>MEMORY RELAY BANK</span><b>8 CELLS</b></header>
          <div>${relayCells}</div>
          <footer><span>INPUT / LEFT—RIGHT</span><span>PREDICTION SEALED</span></footer>
        </div>
        <ol class="rule-sequence compact-rules">
          <li><b>前 10 海里</b><span>机器只观察，不会熄灭命灯。</span><i>WATCH</i></li>
          <li><b>进入追踪区</b><span>只有调用已学会的记忆格并抓中，才会亮红灯。</span><i>TRACK</i></li>
          <li><b>第 80 海里起</b><span>大浪滔天，规则收紧：连中两次就掉一盏灯。</span><i>STORM</i></li>
          <li><b>活到第 100 海里</b><span>三盏命灯没有全灭，藏宝图就归你。</span><i>×</i></li>
        </ol>
      </section>
    </div>

    <footer class="entry-footer">
      <div><span>1953</span><i></i><span>NOW</span></div>
      <p>没有问卷 · 没有账号 · 没有网络请求</p>
      <small>昵称、选择、称号与结果图均在当前设备生成</small>
    </footer>
  `;

  const input = root.querySelector("#callsignInput");
  const count = root.querySelector("#callsignCount");
  const launchButtons = Array.from(root.querySelectorAll("[data-launch]"));
  const initialName = options.nickname || params.get("name") || "";
  if (initialName) input.value = Engine.normaliseNickname(initialName);

  function rawNickname() {
    const cleaned = input.value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
    return Array.from(cleaned).slice(0, 12).join("");
  }

  function updateIdentity() {
    const name = rawNickname();
    if (input.value !== name) input.value = name;
    const length = Array.from(name).length;
    count.textContent = String(length).padStart(2, "0");
    root.classList.toggle("has-identity", length > 0);
  }

  function launch(nextMode) {
    const name = Engine.normaliseNickname(rawNickname() || "匿名船长");
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("variant", nextMode);
    nextUrl.searchParams.set("name", name);
    nextUrl.searchParams.set("shell", "1");
    nextUrl.searchParams.set("start", "1");
    nextUrl.searchParams.delete("qa");
    nextUrl.searchParams.delete("pilot");
    window.history.replaceState({}, "", nextUrl);
    if (typeof miniTool.startMode !== "function") {
      window.location.reload();
      return;
    }
    miniTool.startMode({
      mode: nextMode,
      nickname: name,
      unifiedShell: true,
      startImmediately: true,
    });
  }

  input.addEventListener("input", updateIdentity);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    launch("adventure");
  });
  launchButtons.forEach((button) => {
    button.addEventListener("click", () => launch(button.dataset.launch));
  });

  updateIdentity();
  window.scrollTo(0, 0);
  }

  miniTool.showHub = showUnifiedEntry;
  const initialParams = new URLSearchParams(window.location.search);
  const requested = initialParams.get("variant");
  const ownsDefault = requested === null && !initialParams.has("qa") && !initialParams.has("pilot");
  if (requested === "hub" || ownsDefault) showUnifiedEntry();
})();
