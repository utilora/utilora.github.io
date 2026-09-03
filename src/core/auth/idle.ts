export const DEFAULT_IDLE_TIMEOUT_MINUTES = 30;
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const LAST_ACTIVE_KEY = "utilora_last_active";
export const SESSION_KEY = "utilora_sb_session";

let configuredTimeoutMs = IDLE_TIMEOUT_MS;

export const setIdleTimeoutMs = (ms: number): void => {
  const n = Number(ms);
  if (Number.isFinite(n) && n >= 5 * 60 * 1000 && n <= 1440 * 60 * 1000) {
    configuredTimeoutMs = n;
  }
};

export const currentIdleTimeoutMs = (): number => configuredTimeoutMs;

export const idleExceeded = (lastActive: number, now = Date.now(), timeoutMs = configuredTimeoutMs): boolean => {
  if (!lastActive) return false;
  return now - lastActive > timeoutMs;
};

export const readLastActive = (): number => {
  try {
    const value = Number(localStorage.getItem(LAST_ACTIVE_KEY) || 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
};

export const touchActivity = (): void => {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  } catch {
    /* ignore quota */
  }
};

export const isIdle = (): boolean => idleExceeded(readLastActive());

export const clearIdleSession = (): void => {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LAST_ACTIVE_KEY);
  } catch {
    /* ignore */
  }
};

export const expireIdleSession = (): boolean => {
  try {
    if (!localStorage.getItem(SESSION_KEY)) return false;
    if (!readLastActive()) {
      touchActivity();
      return false;
    }
    if (!isIdle()) return false;
    clearIdleSession();
    return true;
  } catch {
    return false;
  }
};

const noteActivity = (): void => {
  try {
    if (expireIdleSession()) {
      document.dispatchEvent(new CustomEvent("utilora:idle-expired"));
      return;
    }
    if (localStorage.getItem(SESSION_KEY)) touchActivity();
  } catch {
    /* ignore */
  }
};

export const bindIdleTracking = (): void => {
  if (typeof document === "undefined") return;
  const w = window as Window & { __utiloraIdleBound?: boolean };
  if (w.__utiloraIdleBound) return;
  w.__utiloraIdleBound = true;
  if (localStorage.getItem(SESSION_KEY) && !readLastActive()) touchActivity();
  document.addEventListener("click", noteActivity, true);
  document.addEventListener("keydown", noteActivity, true);
  document.addEventListener("touchstart", noteActivity, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") noteActivity();
  });
};
