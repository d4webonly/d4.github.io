import { normalizeInput } from "./normalizer.js";
import { saveGameState } from "./state.js";
import { sendAnalyticsTrigger } from "./analytics.js";

const DEFAULT_MISS_MESSAGE = "他のメッセージを送信してください。";
const DEADLINE_TEXT_BY_MINUTE = {
  30: "シメキリマデサンジュップン",
  29: "シメキリマデニジュウキュウフン",
  28: "シメキリマデニジュウハチフン",
  27: "シメキリマデニジュウナナフン",
  26: "シメキリマデニジュウロクフン",
  25: "シメキリマデニジュウゴフン",
  24: "シメキリマデニジュウヨンフン",
  23: "シメキリマデニジュウサンフン",
  22: "シメキリマデニジュウニフン",
  21: "シメキリマデニジュウイップン",
  20: "シメキリマデニジュップン",
  19: "シメキリマデジュウキュウフン",
  18: "シメキリマデジュウハチフン",
  17: "シメキリマデジュウナナフン",
  16: "シメキリマデジュウロクフン",
  15: "シメキリマデジュウゴフン",
  14: "シメキリマデジュウヨンフン",
  13: "シメキリマデジュウサンフン",
  12: "シメキリマデジュウニフン",
  11: "シメキリマデジュウイップン",
  10: "シメキリマデジュップン",
  9: "シメキリマデキュウフン",
  8: "シメキリマデハチフン",
  7: "シメキリマデナナフン",
  6: "シメキリマデロクフン",
  5: "シメキリマデゴフン",
  4: "シメキリマデヨンフン",
  3: "シメキリマデサンフン",
  2: "シメキリマデニフン",
  1: "シメキリマデイップン"
};

function normalizePlayerNameInput(input) {
  const trimmed = String(input || "").trim();
  const normalized = trimmed
    .replace(/[！!。．.]+$/g, "")
    .replace(/^(私は|わたしは|俺は|僕は|ぼくは|名前は)/, "")
    .replace(/(って呼んで|です|だよ|と呼んでください|でお願いします)$/g, "")
    .trim();

  return normalized || trimmed;
}

export class KeywordGameEngine {
  constructor({ gameState, scenes, keywords, renderer }) {
    this.gameState = gameState;
    this.scenes = scenes;
    this.keywords = keywords;
    this.renderer = renderer;
    this.isCharacterSending = false;
    this.deadlineTimerId = null;
  }

  async start() {
    this.renderer.renderHistory(this.gameState.history);
    this.renderer.setBadEndStatus(this.gameState.isBadEnd);
    this.renderer.setInputLocked(this.gameState.isInputLocked);

    const deadlineExpired = await this.restoreDeadlineTimer();
    if (deadlineExpired) return;

    if (this.gameState.activeScenePlayback && this.gameState.activeScenePlayback.isPlaying) {
      await this.playSceneMessages(this.gameState.activeScenePlayback.sceneId);
      return;
    }

    if (this.gameState.history.length === 0) {
      await this.playSceneMessages(this.gameState.currentScene);
    }
  }

  async submitPlayerMessage(text) {
    if (this.gameState.isInputLocked || this.gameState.isBadEnd) return;

    const playerMessage = this.createMessage("user", text);
    this.addMessage(playerMessage);

    if (this.isCharacterSending) {
      return;
    }

    await this.evaluatePlayerMessage(text);
  }

  async evaluatePlayerMessage(text) {
    if (this.gameState.isBadEnd) return;

    const matchedKeyword = this.findMatchingKeyword(text);

    if (!matchedKeyword) {
      this.handleMiss();
      return;
    }

    sendAnalyticsTrigger(matchedKeyword.triggerId);
    this.applyCapturedInput(matchedKeyword, text);
    this.applyKeywordEffects(matchedKeyword);
    this.applyCounterIncrements(matchedKeyword);

    const shouldLockDuringResponse = Boolean(matchedKeyword.lockInputDuringResponse);
    if (shouldLockDuringResponse) {
      this.gameState.isInputLocked = true;
      this.renderer.setInputLocked(true);
      this.save();
    }

    await this.playResponseMessages(matchedKeyword.response || []);
    if (this.shouldStopMessagePlayback()) return;

    const nextScene = await this.resolveNextSceneAfterKeyword(matchedKeyword);
    if (nextScene) {
      await this.moveToScene(nextScene);
    }

    if (shouldLockDuringResponse && !this.gameState.isBadEnd) {
      this.gameState.isInputLocked = false;
      this.renderer.setInputLocked(false);
      this.save();
    }
  }

  findMatchingKeyword(text) {
    const normalized = normalizeInput(text);
    const candidates = this.keywords
      .filter((entry) => this.isKeywordAvailableInCurrentScene(entry))
      .filter((entry) => this.hasRequiredFlags(entry.requiredFlags))
      .filter((entry) => this.matchKeyword(entry, normalized, text));

    candidates.sort((a, b) => {
      const flagPriority = this.getRequiredFlagCount(b) - this.getRequiredFlagCount(a);
      if (flagPriority !== 0) return flagPriority;
      return this.getMatchTypePriority(a) - this.getMatchTypePriority(b);
    });

    return candidates[0];
  }

  isKeywordAvailableInCurrentScene(entry) {
    if (entry.sceneId === this.gameState.currentScene) return true;

    if (entry.smallTalk === true && Array.isArray(entry.sceneIds)) {
      return entry.sceneIds.includes(this.gameState.currentScene);
    }

    return false;
  }

  matchKeyword(entry, normalized, rawText) {
    if (entry.matchType === "any") return normalized.length > 0;
    if (entry.matchType === "exact") {
      return (entry.keywords || []).some((keyword) => normalized === normalizeInput(keyword));
    }
    if (entry.matchType === "includes") {
      return (entry.keywords || []).some((keyword) => normalized.includes(normalizeInput(keyword)));
    }
    if (entry.matchType === "regex") {
      return (entry.keywords || []).some((keyword) => new RegExp(keyword, "i").test(rawText));
    }

    return false;
  }

  hasRequiredFlags(requiredFlags) {
    if (!requiredFlags || Object.keys(requiredFlags).length === 0) return true;
    return Object.entries(requiredFlags).every(([key, value]) => {
      if (value === false) return this.gameState.flags[key] !== true;
      return this.gameState.flags[key] === value;
    });
  }

  getRequiredFlagCount(entry) {
    return Object.keys(entry.requiredFlags || {}).length;
  }

  getMatchTypePriority(entry) {
    if (entry.matchType === "exact") return 0;
    if (entry.matchType === "includes") return 1;
    if (entry.matchType === "regex") return 2;
    if (entry.matchType === "any") return 3;
    return 4;
  }

  applyCapturedInput(keyword, text) {
    if (!keyword.captureInputAs) return;
    const capturedText = keyword.normalizeCaptureAs === "playerName"
      ? normalizePlayerNameInput(text)
      : text.trim();
    this.gameState[keyword.captureInputAs] = capturedText;
    this.save();
  }

  applyKeywordEffects(keyword) {
    if (keyword.setFlags) {
      Object.assign(this.gameState.flags, keyword.setFlags);
    }

    if (keyword.setRoute !== undefined) {
      this.gameState.route = keyword.setRoute;
    }

    if (keyword.commitPendingPlayerName) {
      const pendingName = String(this.gameState.pendingPlayerName || "").trim();
      if (pendingName) {
        this.gameState.playerName = pendingName;
      }
    }

    if (keyword.overrideDeadlineTimeoutScene) {
      this.gameState.deadlineTimeoutSceneOverride = keyword.overrideDeadlineTimeoutScene;

      if (this.gameState.deadlineTimer) {
        this.gameState.deadlineTimer.timeoutScene = keyword.overrideDeadlineTimeoutScene;
      }
    }

    if (keyword.setBadEndFlag) {
      this.gameState.flags[keyword.setBadEndFlag] = true;
      this.gameState.isBadEnd = true;
      this.renderer.setBadEndStatus(true);
    }

    this.save();
  }

  applyCounterIncrements(keyword) {
    if (!keyword.incrementCounters) return;

    Object.entries(keyword.incrementCounters).forEach(([key, value]) => {
      const amount = Number(value || 0);
      this.gameState.counters[key] = Number(this.gameState.counters[key] || 0) + amount;
    });

    this.save();
  }

  async resolveNextSceneAfterKeyword(keyword) {
    if (keyword.stayInScene) {
      this.gameState.currentScene = keyword.sceneId || this.gameState.currentScene;
      this.save();
      return null;
    }

    if (keyword.checkAnyFlags) {
      const flagNames = keyword.checkAnyFlags.flags || [];
      const hasAnyTrue = flagNames.some((flagName) => this.gameState.flags[flagName] === true);

      if (hasAnyTrue) {
        return keyword.checkAnyFlags.nextSceneIfAnyTrue;
      }

      await this.playResponseMessages(keyword.checkAnyFlags.responseIfAllFalse || []);
      return keyword.checkAnyFlags.nextSceneIfAllFalse;
    }

    if (!keyword.checkRequiredFlags) return keyword.nextScene;

    const requiredFlags = keyword.checkRequiredFlags.flags || [];
    const isComplete = requiredFlags.every((flagName) => this.gameState.flags[flagName] === true);

    if (isComplete) {
      return keyword.checkRequiredFlags.nextSceneIfComplete;
    }

    await this.playResponseMessages(keyword.checkRequiredFlags.responseIfIncomplete || []);
    return keyword.checkRequiredFlags.nextSceneIfIncomplete;
  }

  handleMiss() {
    const sceneMissConfig = this.getSceneMissConfig();
    if (sceneMissConfig.countAsMiss) {
      this.gameState.counters.totalMiss += 1;
    }

    const message = this.createMessage("system", sceneMissConfig.message || DEFAULT_MISS_MESSAGE);
    this.addMessage(message);
  }

  getSceneMissConfig() {
    const scene = this.scenes[this.gameState.currentScene] || {};
    const sceneKeywords = this.keywords.filter((entry) => entry.sceneId === this.gameState.currentScene);
    const shouldCountMiss = sceneKeywords.some((entry) => entry.countAsMiss === true);

    return {
      ...(scene.miss || {}),
      countAsMiss: shouldCountMiss || Boolean(scene.miss && scene.miss.countAsMiss)
    };
  }

  async playSceneMessages(sceneId) {
    await this.playSceneMessagesWithAutoTransition(sceneId, new Set());
  }

  async playSceneMessagesWithAutoTransition(sceneId, visitedScenes) {
    if (visitedScenes.has(sceneId)) return;
    visitedScenes.add(sceneId);

    const scene = this.scenes[sceneId];
    if (!scene) return;

    this.applySceneStartEffects(scene);
    const allowBadEndMessages = this.sceneAllowsBadEndMessages(scene);

    if (Array.isArray(scene.messages) && scene.messages.length > 0) {
      const startIndex = this.getScenePlaybackStartIndex(sceneId);
      await this.playResponseMessages(scene.messages.slice(startIndex), {
        trackProgress: true,
        sceneId,
        startIndex,
        allowBadEndMessages
      });
    }

    if (this.shouldStopMessagePlayback({ allowBadEndMessages })) return;

    if (Array.isArray(scene.messages) && scene.messages.length > 0) {
      this.clearActiveScenePlayback(sceneId);
    }

    if (scene.setFlagsAfterMessages) {
      Object.assign(this.gameState.flags, scene.setFlagsAfterMessages);
      this.save();
    }

    if (scene.unlockInputAfterMessages) {
      this.gameState.isInputLocked = false;
      this.renderer.setInputLocked(false);
      this.save();
    }

    if (this.shouldStopMessagePlayback({ allowBadEndMessages })) return;

    const nextSceneByCounter = this.resolveNextSceneByCounter(scene);
    if (nextSceneByCounter) {
      await this.moveToScene(nextSceneByCounter, visitedScenes);
      return;
    }

    if (scene.nextSceneAfterMessages) {
      await this.moveToScene(scene.nextSceneAfterMessages, new Set());
    }
  }

  resolveNextSceneByCounter(scene) {
    if (!scene.nextSceneByCounter) return null;

    const counterName = scene.nextSceneByCounter.counter;
    const counterValue = Number(this.gameState.counters[counterName] || 0);
    const branches = scene.nextSceneByCounter.branches || [];
    const matchedBranch = branches.find((branch) => {
      if (branch.operator === ">=") return counterValue >= Number(branch.value || 0);
      return false;
    });

    return matchedBranch ? matchedBranch.nextScene : scene.nextSceneByCounter.defaultNextScene;
  }

  applySceneStartEffects(scene) {
    let shouldSave = false;

    if (scene.lockInputOnStart) {
      this.gameState.isInputLocked = true;
      this.renderer.setInputLocked(true);
      shouldSave = true;
    }

    if (scene.setOfflineOnStart) {
      this.gameState.isBadEnd = true;
      this.gameState.isInputLocked = true;
      this.renderer.setBadEndStatus(true);
      this.renderer.setInputLocked(true);
      shouldSave = true;
    }

    if (scene.gaTriggerId) {
      this.gameState.sceneTriggersSent = this.gameState.sceneTriggersSent || {};
      if (!this.gameState.sceneTriggersSent[scene.id]) {
        sendAnalyticsTrigger(scene.gaTriggerId);
        this.gameState.sceneTriggersSent[scene.id] = true;
        shouldSave = true;
      }
    }

    if (shouldSave) this.save();
  }

  async playLatestSceneMessage(sceneId) {
    const scene = this.scenes[sceneId];
    if (!scene || !Array.isArray(scene.messages) || scene.messages.length === 0) return;

    const latestMessage = scene.messages[scene.messages.length - 1];
    await this.playResponseMessages([latestMessage]);
  }

  async playResponseMessages(messages, options = {}) {
    if (!Array.isArray(messages) || messages.length === 0) return;

    this.isCharacterSending = true;
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      if (this.shouldStopMessagePlayback(options)) break;

      const delay = Number(message.delay || 0);
      const shouldShowTyping = this.shouldShowTypingForMessage(message);
      if (delay > 0) {
        if (shouldShowTyping) this.renderer.showTyping();
        await this.wait(delay);
        if (shouldShowTyping) this.renderer.hideTyping();
      }

      if (this.shouldStopMessagePlayback(options)) break;

      const chatMessage = this.createMessage(message.sender || "character", message.text, message);
      this.addMessage(chatMessage);
      sendAnalyticsTrigger(message.triggerId);
      this.startDeadlineTimerIfNeeded(message);
      this.pauseDeadlineTimerIfNeeded(message);
      this.setOfflineOnMessageIfNeeded(message);
      if (message.startCorruptionOverlay && typeof this.renderer.showCorruptionOverlay === "function") {
        this.renderer.showCorruptionOverlay();
      }
      this.updateActiveScenePlayback(options, index);
    }
    this.isCharacterSending = false;
  }

  shouldShowTypingForMessage(message) {
    if (message.badMessage) return false;
    if (message.sender === "system") return false;
    if (message.type === "system") return false;
    return true;
  }

  getScenePlaybackStartIndex(sceneId) {
    const playback = this.gameState.activeScenePlayback;
    if (playback && playback.isPlaying && playback.sceneId === sceneId) {
      return Math.max(0, Number(playback.nextMessageIndex || 0));
    }

    this.gameState.activeScenePlayback = {
      sceneId,
      nextMessageIndex: 0,
      isPlaying: true
    };
    this.save();
    return 0;
  }

  updateActiveScenePlayback(options, relativeIndex) {
    if (!options.trackProgress || !options.sceneId) return;

    this.gameState.activeScenePlayback = {
      sceneId: options.sceneId,
      nextMessageIndex: Number(options.startIndex || 0) + relativeIndex + 1,
      isPlaying: true
    };
    this.save();
  }

  clearActiveScenePlayback(sceneId) {
    const playback = this.gameState.activeScenePlayback;
    if (!playback || playback.sceneId !== sceneId) return;

    this.gameState.activeScenePlayback = null;
    this.save();
  }

  sceneAllowsBadEndMessages(scene) {
    if (scene.setOfflineOnStart) return true;
    return Array.isArray(scene.messages) && scene.messages.some((message) => message.setOfflineOnMessage);
  }

  addMessage(message) {
    this.gameState.history.push(message);
    this.renderer.appendMessage(message);
    this.save();
  }

  async moveToScene(sceneId, visitedScenes = new Set()) {
    this.gameState.currentScene = sceneId;
    this.save();
    await this.playSceneMessagesWithAutoTransition(sceneId, visitedScenes);
  }

  async restoreDeadlineTimer() {
    const timer = this.gameState.deadlineTimer;
    if (!timer || !timer.started || timer.expired) return false;
    if (timer.paused) return false;

    const remainingMs = this.getDeadlineRemainingMs(timer);
    if (remainingMs <= 0) {
      await this.expireDeadlineTimer();
      return true;
    }

    this.scheduleDeadlineTimer(remainingMs);
    return false;
  }

  startDeadlineTimerIfNeeded(message) {
    if (!message.startDeadlineTimer) return;

    const currentTimer = this.gameState.deadlineTimer || {};
    if (currentTimer.started) {
      this.restoreDeadlineTimer();
      return;
    }

    const timeoutScene =
      this.gameState.deadlineTimeoutSceneOverride ||
      message.startDeadlineTimer.timeoutScene ||
      "a08-4_timeout";

    this.gameState.deadlineTimer = {
      started: true,
      startedAt: Date.now(),
      durationMs: Number(message.startDeadlineTimer.durationMs || 1800000),
      timeoutScene,
      expired: false,
      paused: false,
      pausedAt: null,
      remainingMsAtPause: null
    };
    this.save();
    this.restoreDeadlineTimer();
  }

  pauseDeadlineTimerIfNeeded(message) {
    if (!message.pauseDeadlineTimer) return;

    const timer = this.gameState.deadlineTimer;
    if (!timer || !timer.started || timer.expired || timer.paused) return;

    if (this.deadlineTimerId !== null) {
      window.clearTimeout(this.deadlineTimerId);
      this.deadlineTimerId = null;
    }

    const remainingMs = Math.max(0, this.getDeadlineRemainingMs(timer));

    timer.paused = true;
    timer.pausedAt = Date.now();
    timer.remainingMsAtPause = remainingMs;
    this.save();
  }

  setOfflineOnMessageIfNeeded(message) {
    if (!message.setOfflineOnMessage) return;

    this.gameState.isBadEnd = true;
    this.gameState.isInputLocked = true;
    this.renderer.setBadEndStatus(true);
    this.renderer.setInputLocked(true);
    this.save();
  }

  scheduleDeadlineTimer(remainingMs) {
    const timer = this.gameState.deadlineTimer;
    if (timer && timer.paused) return;

    if (this.deadlineTimerId !== null) {
      window.clearTimeout(this.deadlineTimerId);
    }

    this.deadlineTimerId = window.setTimeout(() => {
      this.expireDeadlineTimer();
    }, Math.max(0, remainingMs));
  }

  getDeadlineRemainingMs(timer) {
    if (timer.paused) return Number(timer.remainingMsAtPause || 0);

    const startedAt = Number(timer.startedAt || 0);
    const durationMs = Number(timer.durationMs || 0);
    return startedAt + durationMs - Date.now();
  }

  async expireDeadlineTimer() {
    const timer = this.gameState.deadlineTimer;
    if (!timer || timer.expired) return;
    if (timer.paused) return;

    if (this.deadlineTimerId !== null) {
      window.clearTimeout(this.deadlineTimerId);
      this.deadlineTimerId = null;
    }

    timer.expired = true;
    this.gameState.isInputLocked = true;
    this.isCharacterSending = false;
    this.renderer.setInputLocked(true);
    this.save();

    await this.moveToScene(timer.timeoutScene || "a08-4_timeout");
  }

  shouldStopMessagePlayback(options = {}) {
    if (options.allowBadEndMessages) return false;
    return this.gameState.isBadEnd || Boolean(this.gameState.deadlineTimer && this.gameState.deadlineTimer.expired);
  }

  createMessage(sender, text, options = {}) {
    const messageText = this.resolveMessageText(text, options);

    return {
      sender,
      type: options.type || "text",
      text: this.formatMessageText(messageText),
      src: options.src || null,
      alt: options.alt || "",
      fileName: options.fileName || "",
      systemStyle: options.systemStyle || null,
      badMessage: Boolean(options.badMessage),
      setOfflineOnMessage: Boolean(options.setOfflineOnMessage),
      setHeaderNameOnMessage: options.setHeaderNameOnMessage || null,
      clickTriggerId: options.clickTriggerId || null,
      time: new Date().toISOString()
    };
  }

  resolveMessageText(text, options) {
    if (options.dynamicDeadlineText) {
      return this.getDynamicDeadlineText();
    }

    return text || "";
  }

  formatMessageText(text) {
    const deadlineMinutes = this.getDeadlineRemainingMinutes();
    return String(text)
      .replace(/（([^）]+)）/g, (match, key) => this.getGameStateReplacement(key, match))
      .replaceAll("■分", `${deadlineMinutes}分`)
      .replace(/<br\s*\/?>/gi, "\n");
  }

  getGameStateReplacement(key, fallback) {
    if (key === "名前") return this.gameState.playerName || "あなた";
    if (key === "仮名前") return this.gameState.pendingPlayerName || fallback;
    if (Object.prototype.hasOwnProperty.call(this.gameState, key)) {
      const value = this.gameState[key];
      return value === undefined || value === null || value === "" ? fallback : String(value);
    }
    return fallback;
  }

  getDynamicDeadlineText() {
    const minutes = this.getDeadlineRemainingMinutes();
    if (minutes <= 0) return "シメキリマデゼロフン";
    return DEADLINE_TEXT_BY_MINUTE[minutes] || DEADLINE_TEXT_BY_MINUTE[30];
  }

  getDeadlineRemainingMinutes() {
    const timer = this.gameState.deadlineTimer;
    if (!timer || !timer.started) return 30;
    if (timer.expired) return 0;

    const remainingMs = this.getDeadlineRemainingMs(timer);
    return Math.max(0, Math.floor(remainingMs / 60000));
  }

  save() {
    saveGameState(this.gameState);
  }

  wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
}
