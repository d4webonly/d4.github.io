import { KeywordGameEngine } from "./engine.js";
import { ChatRenderer } from "./renderer.js";
import { clearGameState, loadGameState, saveGameState } from "./state.js";
import { isBlankInput } from "./normalizer.js";
import { showConsoleArt } from "./consoleArt.js";

const DATA_PATHS = {
  scenes: "data/scenes.json",
  keywords: "data/keywords.json"
};

const STAMPS = [
  {
    id: "AMGY",
    src: "assets/stamps/AMGY.png",
    alt: "AMGYスタンプ"
  },
  {
    id: "kKana",
    src: "assets/stamps/kKana.png",
    alt: "金澤かなスタンプ"
  }
];

const STAMP_REPLY_IDS = {
  AMGY: "kKana",
  kKana: "AMGY"
};

let engine;

document.addEventListener("DOMContentLoaded", async () => {
  showConsoleArt();
  setupBootEffect();

  const [scenes, keywords] = await Promise.all([
    loadJson(DATA_PATHS.scenes),
    loadJson(DATA_PATHS.keywords)
  ]);

  const gameState = loadGameState();
  const renderer = new ChatRenderer({
    chatLog: document.getElementById("chatLog"),
    messageList: document.getElementById("messageList"),
    typingIndicator: document.getElementById("typingIndicator"),
    newMessageButton: document.getElementById("newMessageButton"),
    messageInput: document.getElementById("messageInput"),
    sendButton: document.getElementById("sendButton"),
    stampButton: document.getElementById("stampButton"),
    stampPicker: document.getElementById("stampPicker"),
    statusText: document.getElementById("statusText"),
    profileName: document.querySelector(".profile-name")
  });

  engine = new KeywordGameEngine({
    gameState,
    scenes,
    keywords,
    renderer
  });

  setupMessageForm(engine);
  setupStampPicker({ keywordEngine: engine, renderer });
  setupDebugPanel({ engine, scenes, renderer });
  await engine.start();
});

function setupBootEffect() {
  const bootEffect = document.getElementById("bootEffect");
  if (!bootEffect) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const visibleDuration = prefersReducedMotion ? 80 : 1500;

  window.setTimeout(() => {
    bootEffect.classList.add("is-hidden");
  }, visibleDuration);

  bootEffect.addEventListener("transitionend", () => {
    bootEffect.remove();
  }, { once: true });
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

function setupMessageForm(keywordEngine) {
  const form = document.getElementById("messageForm");
  const input = document.getElementById("messageInput");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const text = input.value;
    if (isBlankInput(text) || keywordEngine.gameState.isInputLocked) return;

    input.value = "";
    await keywordEngine.submitPlayerMessage(text.trim());
  });
}

function setupStampPicker({ keywordEngine, renderer }) {
  renderer.bindStampPicker(STAMPS, (stamp) => {
    if (keywordEngine.gameState.isInputLocked) return;

    const message = createStampMessage("user", stamp);

    keywordEngine.gameState.history.push(message);
    saveGameState(keywordEngine.gameState);
    renderer.appendMessage(message);

    const replyStamp = getStampReply(stamp);
    if (!replyStamp) return;

    window.setTimeout(() => {
      if (keywordEngine.gameState.isInputLocked || keywordEngine.gameState.isBadEnd) return;

      const replyMessage = createStampMessage("bot", replyStamp);
      keywordEngine.gameState.history.push(replyMessage);
      saveGameState(keywordEngine.gameState);
      renderer.appendMessage(replyMessage);
    }, 2000);
  });
}

function getStampReply(stamp) {
  const replyId = STAMP_REPLY_IDS[stamp.id];
  if (!replyId) return null;
  return STAMPS.find((item) => item.id === replyId) || null;
}

function createStampMessage(sender, stamp) {
  return {
    sender,
    type: "stamp",
    stampId: stamp.id,
    src: stamp.src,
    alt: stamp.alt,
    time: new Date().toISOString()
  };
}

// === Debug scene selector options start ===
// Remove this block together with setupDebugPanel() before public release.
const DEBUG_SCENE_OPTIONS = [
  { sceneId: "01_common_02", label: "……え！？　ってことは、もう6月6日の21時は……" },
  { sceneId: "01_common_03", label: "でも、あなたとのやりとり以外は何もできなくって……" },
  { sceneId: "01_common_04", label: "わ" },
  { sceneId: "01_common_05", label: "えーっと……今、私が座らされている目の前には……" },
  { sceneId: "01_common_08", label: "シャッターが下りてる！？嘘……閉じ込められちゃう！？" },
  { sceneId: "01_common_11b", label: "……あの、もしかして前に助けてくれた人ですか？" },

  { sceneId: "a02_organize_01", label: "よし。それじゃあ、まずは現状を整理しよう。" },
  { sceneId: "a02_organize_02", label: "（名前）には、入稿方法を調べて教えてもらいたいんだけど……" },

  { sceneId: "a03_specification_intro", label: "それじゃあ、これが必要だよね！" },

  { sceneId: "a05_confirmation", label: "脱　稿　し　ま　し　た　！　！" },
  { sceneId: "a05_confirmation_page_total", label: "それじゃあ今教えてもらったところを足す、と……" },
  { sceneId: "a05_confirmation_numbering", label: "じゃあ次はノンブルってやつ。" },
  { sceneId: "a05_confirmation_colophon", label: "そしたら、次は奥付だね。" },
  { sceneId: "a05_confirmation_cover", label: "あとは、表紙。" },
  { sceneId: "a05_confirmation_cover_paper", label: "表紙に使う用紙の相談も乗ってほしい！" },
  { sceneId: "a05_confirmation_rights", label: "そしたら、権利関係のチェックだね！" },

  { sceneId: "a06_contribution", label: "これで入稿時のチェックリストは全て書き終え……" },
  { sceneId: "a06_contribution_form", label: "それじゃあ、このURLリンク先にデータを送ってくれるかな？" },

  { sceneId: "a07_finalQ", label: "ふーっ……データは一緒にチェックしたし……" },

  { sceneId: "b02_organize_01", label: "よし。それじゃあ、まずは現状を整理しましょう。" },
  { sceneId: "b02_organize_03", label: "原稿が、終わってないんです……。" },

  { sceneId: "b03_specification", label: "画像メッセージ：assets/sample_specification.png" },
  { sceneId: "b03_specification_opt_hint", label: "左側の問題集みたいな本ですね。" },
  { sceneId: "b03_specification_req_print", label: "印刷の種類ですね！決めていきましょう！" },
  { sceneId: "b03_specification_req_size", label: "サイズ……本の大きさですよね。" },

  { sceneId: "b05_confirmation", label: "……よしっ！できましたっ！これで……" },
  { sceneId: "b05_confirmation_page", label: "それでは、まずはページ数ですね" },
  { sceneId: "b05_confirmation_numbering", label: "じゃあ次はノンブル……ですね。" },
  { sceneId: "b05_confirmation_colophon", label: "そしたら、次は奥付！" },
  { sceneId: "b05_confirmation_imposition_intro", label: "次は、面付け……面付け？" },
  { sceneId: "b05_confirmation_rights", label: "そしたら、権利関係のチェックですね！" },

  { sceneId: "b06_contribution", label: "これで入稿時のチェックリストは全て書き終え……" },
  { sceneId: "b06_contribution_form", label: "それじゃあ、このURLリンク先にデータを送ってください！" },

  { sceneId: "a08-1_true", label: "A True｜おまたせ！！ねえっ、これ見て！！" },
  { sceneId: "a08-2_totalMiss", label: "A Bad｜え？データとリストが突き返されちゃった。" },
  { sceneId: "a08-3_banned", label: "A Banned｜……これで、オッケーかな……！？" },
  { sceneId: "a08-4_timeout", label: "A Timeout｜シメキリマデゼロフン" },

  { sceneId: "b08-1_true", label: "B True｜……わ！わーっ！作ったデータが紙になっていきます……！" },
  { sceneId: "b08-2_totalMiss", label: "B Bad｜コピー機が動きません……なんで？" },
  { sceneId: "b08-3_banned", label: "B Banned｜わ、コピー機が動き始めました！" },
  { sceneId: "b08-4_timeout", label: "B Timeout｜シメキリマデゼロフン" }
];
// === Debug scene selector options end ===

// Debug UI: remove this block when development tooling is no longer needed.
function setupDebugPanel({ engine: keywordEngine, scenes, renderer }) {
  const params = new URLSearchParams(window.location.search);
  if (params.get("debug") !== "1") return;

  const panel = document.getElementById("debugPanel");
  const toggleButton = document.getElementById("debugToggleButton");
  const panelBody = document.getElementById("debugPanelBody");
  const resetButton = document.getElementById("debugResetButton");
  const logButton = document.getElementById("debugLogButton");
  const sceneSelect = document.getElementById("debugSceneSelect");
  const playerNameInput = document.getElementById("debugPlayerNameInput");
  const playerNameButton = document.getElementById("debugPlayerNameButton");
  const missCount = document.getElementById("debugMissCount");
  const missPlusOneButton = document.getElementById("debugMissPlusOneButton");
  const missPlusThousandButton = document.getElementById("debugMissPlusThousandButton");
  const missResetButton = document.getElementById("debugMissResetButton");
  const deadlineRemaining = document.getElementById("debugDeadlineRemaining");
  const setDeadlineFiveSecondsButton = document.getElementById("debugSetDeadlineFiveSecondsButton");
  const flagPrintCountReduced = document.getElementById("debugFlagPrintCountReduced");
  const flagCouponSuccess = document.getElementById("debugFlagCouponSuccess");
  const flagCouponFailed = document.getElementById("debugFlagCouponFailed");
  const flagsOutput = document.getElementById("debugFlagsOutput");

  const debugSceneOptions = DEBUG_SCENE_OPTIONS.filter((item) => scenes[item.sceneId]);
  debugSceneOptions.forEach((item, index) => {
    const option = document.createElement("option");
    option.value = item.sceneId;
    option.textContent = `${String(index + 1).padStart(2, "0")} ${item.sceneId}｜${item.label}`;
    sceneSelect.appendChild(option);
  });

  if (debugSceneOptions.some((item) => item.sceneId === keywordEngine.gameState.currentScene)) {
    sceneSelect.value = keywordEngine.gameState.currentScene;
  } else if (debugSceneOptions.length > 0) {
    sceneSelect.value = debugSceneOptions[0].sceneId;
  }
  playerNameInput.value = keywordEngine.gameState.playerName || "";
  refreshDebugState();
  panel.hidden = false;

  toggleButton.addEventListener("click", () => {
    const isCollapsed = panel.classList.toggle("is-collapsed");
    panelBody.hidden = isCollapsed;
    toggleButton.textContent = isCollapsed ? "+" : "-";
    toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
  });

  resetButton.addEventListener("click", () => {
    clearGameState();
    window.location.reload();
  });

  logButton.addEventListener("click", () => {
    refreshDebugState();
    console.log("gameState", structuredClone(keywordEngine.gameState));
  });

  playerNameButton.addEventListener("click", () => {
    keywordEngine.gameState.playerName = playerNameInput.value.trim();
    saveGameState(keywordEngine.gameState);
    refreshDebugState();
  });

  missPlusOneButton.addEventListener("click", () => {
    updateDebugMissCount(keywordEngine, 1);
    refreshDebugState();
  });

  missPlusThousandButton.addEventListener("click", () => {
    updateDebugMissCount(keywordEngine, 1000);
    refreshDebugState();
  });

  missResetButton.addEventListener("click", () => {
    keywordEngine.gameState.counters.totalMiss = 0;
    saveGameState(keywordEngine.gameState);
    refreshDebugState();
  });

  setDeadlineFiveSecondsButton.addEventListener("click", () => {
    const timer = {
      started: true,
      startedAt: Date.now() - 1795000,
      durationMs: 1800000,
      timeoutScene: "a08-4_timeout",
      expired: false,
      ...(keywordEngine.gameState.deadlineTimer || {})
    };

    timer.started = true;
    timer.expired = false;
    timer.startedAt = Date.now() + 3000 - Number(timer.durationMs || 1800000);
    keywordEngine.gameState.deadlineTimer = timer;
    saveGameState(keywordEngine.gameState);
    keywordEngine.restoreDeadlineTimer();
    refreshDebugState();
  });

  sceneSelect.addEventListener("change", async () => {
    keywordEngine.gameState.currentScene = sceneSelect.value;
    saveGameState(keywordEngine.gameState);
    renderer.setBadEndStatus(keywordEngine.gameState.isBadEnd);
    await keywordEngine.playSceneMessages(sceneSelect.value);
    refreshDebugState();
    console.log("currentScene changed:", sceneSelect.value);
  });

  [
    [flagPrintCountReduced, "a07_printCountReduced"],
    [flagCouponSuccess, "a07_couponSuccess"],
    [flagCouponFailed, "a07_couponFailed"]
  ].forEach(([checkbox, flagName]) => {
    checkbox.addEventListener("change", () => {
      keywordEngine.gameState.flags[flagName] = checkbox.checked;
      saveGameState(keywordEngine.gameState);
      refreshDebugState();
    });
  });

  function refreshDebugState() {
    missCount.textContent = String(keywordEngine.gameState.counters.totalMiss || 0);
    deadlineRemaining.textContent = formatDeadlineRemaining(keywordEngine.gameState.deadlineTimer);
    flagPrintCountReduced.checked = keywordEngine.gameState.flags.a07_printCountReduced === true;
    flagCouponSuccess.checked = keywordEngine.gameState.flags.a07_couponSuccess === true;
    flagCouponFailed.checked = keywordEngine.gameState.flags.a07_couponFailed === true;
    flagsOutput.textContent = JSON.stringify(keywordEngine.gameState.flags || {}, null, 2);
  }

  window.setInterval(refreshDebugState, 1000);
}

function updateDebugMissCount(keywordEngine, amount) {
  keywordEngine.gameState.counters.totalMiss =
    Number(keywordEngine.gameState.counters.totalMiss || 0) + amount;
  saveGameState(keywordEngine.gameState);
}

function formatDeadlineRemaining(timer) {
  if (!timer || !timer.started) return "notStarted";
  if (timer.expired) return "expired";

  const remainingMs = Number(timer.startedAt || 0) + Number(timer.durationMs || 0) - Date.now();
  if (remainingMs <= 0) return "0:00";

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
