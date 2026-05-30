export const STORAGE_KEY = "line_chat_game_state_v1";
export const STATE_VERSION = 1;

export function createInitialGameState() {
  return {
    version: STATE_VERSION,
    currentScene: "00_start",
    playerName: "",
    pendingPlayerName: "",
    route: null,
    flags: {},
    items: [],
    counters: {
      totalMiss: 0
    },
    history: [],
    sceneTriggersSent: {},
    activeScenePlayback: null,
    deadlineTimeoutSceneOverride: null,
    deadlineTimer: {
      started: false,
      startedAt: null,
      durationMs: 1800000,
      timeoutScene: "a08-4_timeout",
      expired: false,
      paused: false,
      pausedAt: null,
      remainingMsAtPause: null
    },
    isInputLocked: false,
    isBadEnd: false
  };
}

export function loadGameState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return createInitialGameState();

  try {
    const parsed = JSON.parse(saved);
    if (!parsed || parsed.version !== STATE_VERSION) {
      clearGameState();
      return createInitialGameState();
    }

    return {
      ...createInitialGameState(),
      ...parsed,
      counters: {
        ...createInitialGameState().counters,
        ...(parsed.counters || {})
      },
      deadlineTimer: {
        ...createInitialGameState().deadlineTimer,
        ...(parsed.deadlineTimer || {})
      },
      flags: parsed.flags || {},
      sceneTriggersSent: parsed.sceneTriggersSent || {},
      activeScenePlayback: parsed.activeScenePlayback || null,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      history: Array.isArray(parsed.history) ? parsed.history : []
    };
  } catch (error) {
    console.warn("Failed to load game state. Resetting save data.", error);
    clearGameState();
    return createInitialGameState();
  }
}

export function saveGameState(gameState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
}

export function clearGameState() {
  localStorage.removeItem(STORAGE_KEY);
}
