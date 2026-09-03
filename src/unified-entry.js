/*
 * Unified product entry. It owns the query-less route and ?variant=hub,
 * then launches either game in the same document. Only authored collection IDs
 * and anonymous aggregate bests persist locally; there is no network access,
 * remote asset, or full-page navigation.
 */
(function installUnifiedEntry() {
  "use strict";

  const Engine = window.MindReader;
  if (!Engine) return;
  const miniTool = window.ShannonMiniTool || {};
  window.ShannonMiniTool = miniTool;
  let activeCabinetCleanup = null;

  function availableCollectionStorage() {
    try {
      return window.localStorage;
    } catch (_error) {
      return null;
    }
  }

  const collection = miniTool.collection || Engine.createCollectionStore(availableCollectionStorage());
  miniTool.collection = collection;

  function collectionObjectMarkup(item) {
    const mark = item.id === "question-manuscript" || item.id === "shannon-breaker"
      ? "?"
      : item.id === "most-wanted" ? "!" : "";
    return `<div class="cabinet-object cabinet-object--${item.id}" aria-hidden="true"><i></i><b>${mark}</b><span></span></div>`;
  }

  function collectionContactMarkup(response) {
    return `<b class="cabinet-response__contacts" aria-label="档案响应 ${Math.min(3, response.level)} / 3">${[1, 2, 3]
      .map((step) => `<i class="${response.level >= step ? "is-on" : ""}"></i>`)
      .join("")}</b>`;
  }

  function collectionSlotMarkup(item, highlighted) {
    const stateClass = item.unlocked ? "is-unlocked" : "is-locked";
    const newClass = highlighted && item.unlocked ? "is-new" : "";
    const responseClass = `response-level-${item.response.level}`;
    const isResponsive = item.id === "question-manuscript" || item.group === "seal";
    const status = highlighted && item.unlocked
      ? "本次新收录"
      : isResponsive ? item.response.label : item.unlocked ? "已归档" : item.hint;
    return `
      <article class="cabinet-slot ${stateClass} ${newClass} ${responseClass}" data-collection-item="${item.id}">
        <button class="cabinet-slot__inspect" type="button" data-inspect-collection aria-label="查看${item.name}档案，${status}"></button>
        <header><span>${item.code}</span><i aria-hidden="true"></i></header>
        ${collectionObjectMarkup(item)}
        <h3>${item.name}</h3>
        <p>${status}</p>
        ${isResponsive ? `<span class="cabinet-response">${collectionContactMarkup(item.response)}<em>${item.response.evidence || "等待实验记录"}</em></span>` : ""}
      </article>
    `;
  }

  function collectionCompletionMarkup(snapshot) {
    if (!snapshot.complete) return "";
    return `
      <section class="collection-completion" aria-labelledby="collectionCompletionTitle">
        <div class="collection-completion__plate" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div>
          <small>HUMAN–MACHINE RELAY STUDY COMPLETE</small>
          <h3 id="collectionCompletionTitle">1953 实验总档</h3>
          <p>你既证明了人能骗过机器，也留下了机器读穿人的证据。</p>
        </div>
        <button type="button" data-collection-certificate>生成最终总档</button>
      </section>
    `;
  }

  function collectionEvidenceMarkup(item) {
    const response = item.response;
    const hasProgressiveResponse = item.id === "question-manuscript" || item.group === "seal";
    const confirmation = response.confirmations > 0
      ? `<li><span>累计核验</span><strong>× ${response.confirmations}</strong></li>`
      : "";
    const emptyEvidence = item.id === "question-manuscript"
      ? "先留下完整航迹"
      : item.group === "seal" ? "先完成一份 CASE 8 样本" : item.hint;
    const evidence = response.evidence || (hasProgressiveResponse ? emptyEvidence : item.hint);
    return `
      <header><div><small>${item.code} / ${item.unlocked ? "ARCHIVED" : "UNFILED"}</small><h3>${item.name}</h3></div><button type="button" data-close-evidence aria-label="关闭证据抽屉">×</button></header>
      <div class="collection-evidence__signal response-level-${response.level}">
        ${collectionContactMarkup(response)}
        <strong>${response.label}</strong>
      </div>
      <p>${item.unlocked ? item.lore : "机器没有说明触发条件，只留下了本机实验记录。"}</p>
      <ul>
        <li><span>${item.unlocked ? "归档证据" : "当前证据"}</span><strong>${evidence}</strong></li>
        ${confirmation}
      </ul>
    `;
  }

  function collectionCabinetMarkup(snapshot, highlightedIds) {
    const treasures = snapshot.items.filter((item) => item.group === "treasure");
    const seals = snapshot.items.filter((item) => item.group === "seal");
    const slot = (item) => collectionSlotMarkup(item, highlightedIds.includes(item.id));
    return `
      <header class="collection-cabinet__header">
        <div><small>SHANNON RELAY CABINET / 1953</small><h2 id="collectionCabinetTitle">香农档案柜</h2></div>
        <div class="collection-cabinet__count"><strong data-collection-count>${snapshot.count}</strong><span>/ ${snapshot.total} 已收录</span></div>
        <button type="button" data-close-collection aria-label="关闭香农档案柜">×</button>
      </header>
      <div class="collection-cabinet__scroll">
        ${collectionCompletionMarkup(snapshot)}
        <section class="collection-shelf collection-shelf--treasure" aria-labelledby="treasureShelfTitle">
          <header><div><small>SEA RECOVERY / 100 NAUTICAL MILES</small><h3 id="treasureShelfTitle">海峡回收物</h3></div><span>04 SLOTS</span></header>
          <div class="collection-grid collection-grid--treasure">${treasures.map(slot).join("")}</div>
        </section>
        <section class="collection-shelf collection-shelf--seal" aria-labelledby="sealShelfTitle">
          <header><div><small>CASE 8 / SEALED VERIFICATION</small><h3 id="sealShelfTitle">八格签发章</h3></div><span>02 SLOTS</span></header>
          <div class="collection-grid collection-grid--seal">${seals.map(slot).join("")}</div>
        </section>
        <p class="collection-cabinet__privacy"><i aria-hidden="true"></i><span>只在这台设备保存六个解锁项、结算次数、最佳汇总数字和速度设置。昵称、完整路线与逐手选择不会写入档案柜；系统清理本地数据后，收藏也会消失。</span></p>
      </div>
      <footer class="collection-cabinet__footer">
        <span data-reset-status aria-live="polite">无账号 · 无上传 · 可随时清空</span>
        <button type="button" data-reset-collection>清空本机收藏</button>
      </footer>
      <section class="collection-evidence" data-evidence-drawer aria-live="polite" hidden></section>
    `;
  }

  function updateCollectionIndicators() {
    const snapshot = collection.snapshot();
    Array.from(document.querySelectorAll("[data-collection-count]")).forEach((node) => {
      node.textContent = snapshot.count;
    });
    Array.from(document.querySelectorAll("[data-collection-relay]")).forEach((node) => {
      node.classList.toggle("is-on", snapshot.unlocked.includes(node.dataset.collectionRelay));
    });
    Array.from(document.querySelectorAll("[data-collection]")).forEach((button) => {
      button.setAttribute("aria-label", `打开香农档案柜，已收录 ${snapshot.count} / ${snapshot.total}`);
    });
  }

  function showCollectionCabinet(options = {}) {
    if (activeCabinetCleanup) activeCabinetCleanup();
    let highlightedIds = Array.isArray(options.highlightIds)
      ? options.highlightIds.filter((id) => Engine.COLLECTION_ITEMS.some((item) => item.id === id))
      : [];
    let resetArmed = false;
    let resetTimer = null;
    let evidenceTrigger = null;
    const previousFocus = document.activeElement;
    const modal = document.createElement("div");
    modal.className = "collection-cabinet-modal";
    modal.setAttribute("role", "presentation");
    const cabinet = document.createElement("section");
    cabinet.className = "collection-cabinet";
    cabinet.setAttribute("role", "dialog");
    cabinet.setAttribute("aria-modal", "true");
    cabinet.setAttribute("aria-labelledby", "collectionCabinetTitle");
    modal.appendChild(cabinet);
    document.body.appendChild(modal);

    function renderCabinet() {
      const snapshot = collection.snapshot();
      cabinet.className = `collection-cabinet ${snapshot.complete ? "is-complete" : ""}`;
      cabinet.innerHTML = collectionCabinetMarkup(snapshot, highlightedIds);
    }

    function closeEvidence(options = {}) {
      const drawer = cabinet.querySelector("[data-evidence-drawer]");
      if (!drawer || drawer.hidden) return false;
      drawer.hidden = true;
      drawer.innerHTML = "";
      cabinet.classList.remove("has-open-evidence");
      if (
        options.restoreFocus !== false
        && evidenceTrigger
        && document.documentElement.contains(evidenceTrigger)
      ) {
        evidenceTrigger.focus();
      }
      evidenceTrigger = null;
      return true;
    }

    function closeCabinet() {
      if (resetTimer !== null) window.clearTimeout(resetTimer);
      document.removeEventListener("keydown", onCabinetKeydown);
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      if (activeCabinetCleanup === closeCabinet) activeCabinetCleanup = null;
      if (miniTool.closeCollectionCabinet === closeCabinet) miniTool.closeCollectionCabinet = null;
      if (previousFocus && document.documentElement.contains(previousFocus)) previousFocus.focus();
    }

    function onCabinetKeydown(event) {
      if (event.key !== "Escape") return;
      if (!closeEvidence()) closeCabinet();
    }

    renderCabinet();
    activeCabinetCleanup = closeCabinet;
    miniTool.closeCollectionCabinet = closeCabinet;
    document.addEventListener("keydown", onCabinetKeydown);

    modal.addEventListener("click", (event) => {
      const closeButton = event.target.closest("[data-close-collection]");
      const resetButton = event.target.closest("[data-reset-collection]");
      const inspectButton = event.target.closest("[data-inspect-collection]");
      const closeEvidenceButton = event.target.closest("[data-close-evidence]");
      const certificateButton = event.target.closest("[data-collection-certificate]");
      if (event.target === modal || closeButton) {
        closeCabinet();
        return;
      }
      if (closeEvidenceButton) {
        closeEvidence();
        return;
      }
      if (inspectButton) {
        const slot = inspectButton.closest("[data-collection-item]");
        const item = collection.snapshot().items.find((candidate) => candidate.id === slot.dataset.collectionItem);
        const drawer = cabinet.querySelector("[data-evidence-drawer]");
        if (!item || !drawer) return;
        evidenceTrigger = inspectButton;
        drawer.innerHTML = collectionEvidenceMarkup(item);
        drawer.hidden = false;
        cabinet.classList.add("has-open-evidence");
        drawer.querySelector("[data-close-evidence]").focus();
        return;
      }
      if (certificateButton) {
        const certificateSnapshot = collection.snapshot();
        closeCabinet();
        showCollectionCertificate(certificateSnapshot);
        return;
      }
      if (!resetButton) return;
      const status = cabinet.querySelector("[data-reset-status]");
      if (!resetArmed) {
        resetArmed = true;
        resetButton.textContent = "再次点击确认清空";
        status.textContent = "收藏清空后无法恢复";
        resetTimer = window.setTimeout(() => {
          resetArmed = false;
          resetButton.textContent = "清空本机收藏";
          status.textContent = "无账号 · 无上传 · 可随时清空";
        }, 4000);
        return;
      }
      if (resetTimer !== null) window.clearTimeout(resetTimer);
      collection.reset();
      highlightedIds = [];
      resetArmed = false;
      renderCabinet();
      updateCollectionIndicators();
      const nextStatus = cabinet.querySelector("[data-reset-status]");
      nextStatus.textContent = "本机收藏已清空";
      cabinet.querySelector("[data-reset-collection]").focus();
    });

    cabinet.querySelector("[data-close-collection]").focus();
  }

  function certificateFont(size, options = {}) {
    const weight = options.weight || 400;
    const family = options.mono
      ? 'ui-monospace, "SFMono-Regular", Consolas, monospace'
      : options.serif
        ? 'Georgia, "Songti SC", "Noto Serif CJK SC", serif'
        : '"Arial Narrow", "PingFang SC", "Noto Sans CJK SC", sans-serif';
    return `${weight} ${size}px ${family}`;
  }

  function drawCertificateWrappedText(context, value, x, y, maxWidth, lineHeight) {
    const glyphs = Array.from(value);
    const lines = [];
    let line = "";
    glyphs.forEach((glyph) => {
      const next = line + glyph;
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line);
        line = glyph;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    lines.slice(0, 3).forEach((current, index) => context.fillText(current, x, y + index * lineHeight));
  }

  function createCollectionCertificateDataUrl(snapshot) {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1440;
    const context = canvas.getContext("2d");
    const records = snapshot.records;
    context.fillStyle = "#07100c";
    context.fillRect(0, 0, 1080, 1440);
    context.strokeStyle = "rgba(118,247,176,0.07)";
    context.lineWidth = 1;
    for (let x = 0; x <= 1080; x += 54) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, 1440);
      context.stroke();
    }
    for (let y = 0; y <= 1440; y += 54) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(1080, y);
      context.stroke();
    }

    context.strokeStyle = "#76f7b0";
    context.lineWidth = 4;
    context.strokeRect(58, 58, 964, 1324);
    context.fillStyle = "#76f7b0";
    context.font = certificateFont(21, { mono: true, weight: 700 });
    context.textAlign = "left";
    context.fillText("BELL LABS / RELAY CABINET", 92, 112);
    context.fillStyle = "#ffb84a";
    context.textAlign = "right";
    context.fillText("FILE COMPLETE / 06 OF 06", 988, 112);

    context.textAlign = "center";
    context.fillStyle = "#f0e6ca";
    context.font = certificateFont(80, { serif: true, weight: 700 });
    context.fillText("1953 实验总档", 540, 230);
    context.fillStyle = "#9eb2a7";
    context.font = certificateFont(28, { serif: true });
    drawCertificateWrappedText(
      context,
      "你既证明了人能骗过机器，也留下了机器读穿人的证据。",
      540,
      286,
      790,
      42,
    );

    snapshot.items.forEach((item, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 104 + column * 444;
      const y = 378 + row * 178;
      context.fillStyle = item.group === "seal" ? "rgba(17,50,35,0.82)" : "rgba(43,35,18,0.82)";
      context.fillRect(x, y, 424, 148);
      context.strokeStyle = item.id === "most-wanted" ? "#b74f47" : item.group === "seal" ? "#4f9f78" : "#8b7445";
      context.lineWidth = 2;
      context.strokeRect(x, y, 424, 148);
      context.fillStyle = item.id === "most-wanted" ? "#ef665c" : item.group === "seal" ? "#76f7b0" : "#ffb84a";
      context.beginPath();
      context.arc(x + 34, y + 34, 8, 0, Math.PI * 2);
      context.fill();
      context.font = certificateFont(20, { mono: true, weight: 700 });
      context.textAlign = "left";
      context.fillText(item.code, x + 58, y + 42);
      context.fillStyle = "#f0e6ca";
      context.font = certificateFont(34, { serif: true, weight: 700 });
      context.fillText(item.name, x + 30, y + 96);
      context.fillStyle = "#91a299";
      context.font = certificateFont(17, { mono: true });
      const confirmation = item.response.confirmations > 1 ? ` / VERIFIED ×${item.response.confirmations}` : " / ARCHIVED";
      context.fillText(confirmation, x + 30, y + 127);
    });

    const bestDuel = records.duelMinMachineWins === null
      ? "—"
      : `${64 - records.duelMinMachineWins} : ${records.duelMinMachineWins}`;
    const deepestDuel = records.duelMaxMachineWins === null
      ? "—"
      : `${64 - records.duelMaxMachineWins} : ${records.duelMaxMachineWins}`;
    const metrics = [
      ["成功航行", String(records.successfulVoyages)],
      ["最少红光", records.minDangerHits === null ? "—" : String(records.minDangerHits)],
      ["CASE 8 最佳", bestDuel],
      ["最深观察", deepestDuel],
    ];
    context.strokeStyle = "#59645c";
    context.strokeRect(104, 942, 872, 206);
    metrics.forEach((metric, index) => {
      const x = 140 + (index % 2) * 430;
      const y = 1000 + Math.floor(index / 2) * 88;
      context.fillStyle = "#899a91";
      context.font = certificateFont(18, { mono: true });
      context.textAlign = "left";
      context.fillText(metric[0], x, y);
      context.fillStyle = index === 1 ? "#ffb84a" : "#76f7b0";
      context.font = certificateFont(34, { mono: true, weight: 700 });
      context.fillText(metric[1], x, y + 40);
    });

    context.fillStyle = "#d8cba9";
    context.font = certificateFont(26, { serif: true, weight: 700 });
    context.textAlign = "center";
    context.fillText("A MIND-READING (?) MACHINE / EXPERIMENT CLOSED", 540, 1240);
    context.fillStyle = "#6f8378";
    context.font = certificateFont(18, { mono: true });
    context.fillText("GENERATED LOCALLY · NO ACCOUNT · NOT UPLOADED", 540, 1330);
    return canvas.toDataURL("image/png");
  }

  async function saveCollectionCertificate(dataUrl, status, button) {
    const bridge = window.xhs && window.xhs.miniTool;
    if (!bridge || typeof bridge.writeTempFile !== "function" || typeof bridge.saveImageToPhotosAlbum !== "function") {
      status.textContent = "当前环境没有相册能力，请使用系统截图。";
      return;
    }
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "保存中…";
    try {
      const temporary = await bridge.writeTempFile({ data: dataUrl });
      if (!temporary || typeof temporary.filePath !== "string" || !temporary.filePath) {
        throw new Error("writeTempFile returned no filePath");
      }
      await bridge.saveImageToPhotosAlbum({ filePath: temporary.filePath });
      status.textContent = "最终总档已保存到系统相册。";
    } catch (_error) {
      status.textContent = "保存失败，请允许相册权限后重试，或使用系统截图。";
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function showCollectionCertificate(snapshot) {
    if (!snapshot || !snapshot.complete) return;
    const previous = document.querySelector(".collection-certificate-modal");
    if (previous) previous.parentNode.removeChild(previous);
    const previousFocus = document.activeElement;
    const dataUrl = createCollectionCertificateDataUrl(snapshot);
    const modal = document.createElement("div");
    modal.className = "share-card-modal collection-certificate-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "1953 实验总档预览");
    modal.innerHTML = `
      <div class="share-card-modal__panel collection-certificate-modal__panel">
        <header><div><small>FILE COMPLETE / 06 OF 06</small><strong>1953 实验总档</strong></div><button type="button" data-close-certificate aria-label="关闭最终总档">×</button></header>
        <img src="${dataUrl}" alt="六份香农档案全部收录的最终总档">
        <footer><span data-certificate-status aria-live="polite">点击保存到系统相册</span><button type="button" data-save-certificate>保存最终总档</button></footer>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => {
      document.removeEventListener("keydown", onKeydown);
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      if (previousFocus && document.documentElement.contains(previousFocus)) previousFocus.focus();
    };
    const onKeydown = (event) => { if (event.key === "Escape") close(); };
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-close-certificate]")) close();
    });
    const saveButton = modal.querySelector("[data-save-certificate]");
    const status = modal.querySelector("[data-certificate-status]");
    saveButton.addEventListener("click", () => saveCollectionCertificate(dataUrl, status, saveButton));
    document.addEventListener("keydown", onKeydown);
    modal.querySelector("[data-close-certificate]").focus();
  }

  function collectionRelayMarkup(snapshot) {
    return snapshot.items.map((item) => (
      `<i class="${item.unlocked ? "is-on" : ""}" data-collection-relay="${item.id}" aria-hidden="true"></i>`
    )).join("");
  }

  miniTool.showCollectionCabinet = showCollectionCabinet;
  miniTool.showCollectionCertificate = () => showCollectionCertificate(collection.snapshot());

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
    if (activeCabinetCleanup) activeCabinetCleanup();
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
  const collectionSnapshot = collection.snapshot();
  const collectionRelays = collectionRelayMarkup(collectionSnapshot);

  root.innerHTML = `
    <div class="entry-noise" aria-hidden="true"></div>
    <header class="entry-topbar">
      <div><i></i><span>BELL TELEPHONE LABORATORIES</span></div>
      <button class="entry-topbar__collection" type="button" data-collection aria-label="打开香农档案柜，已收录 ${collectionSnapshot.count} / ${collectionSnapshot.total}"><i aria-hidden="true"></i><span>档案柜</span><b><em data-collection-count>${collectionSnapshot.count}</em> / ${collectionSnapshot.total}</b></button>
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
          <button class="collection-entry" type="button" data-collection aria-label="打开香农档案柜，已收录 ${collectionSnapshot.count} / ${collectionSnapshot.total}">
            <b class="collection-entry__relays">${collectionRelays}</b>
            <span><small>RELAY CABINET / 本机收藏</small><strong>打开香农档案柜</strong></span>
            <em><strong data-collection-count>${collectionSnapshot.count}</strong><small>/ ${collectionSnapshot.total}</small></em>
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
      <small>档案柜只保存解锁、最佳汇总与速度设置 · 昵称、路线与逐手记录不保存</small>
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
  Array.from(root.querySelectorAll("[data-collection]")).forEach((button) => {
    button.addEventListener("click", () => showCollectionCabinet());
  });

  updateIdentity();
  updateCollectionIndicators();
  window.scrollTo(0, 0);
  }

  miniTool.showHub = showUnifiedEntry;
  const initialParams = new URLSearchParams(window.location.search);
  const requested = initialParams.get("variant");
  const ownsDefault = requested === null && !initialParams.has("qa") && !initialParams.has("pilot");
  if (requested === "hub" || ownsDefault) showUnifiedEntry();
})();
