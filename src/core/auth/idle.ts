export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const LAST_ACTIVE_KEY = "utilora_last_active";
export const SESSION_KEY = "utilora_sb_session";

export const idleExceeded = (lastActive: number, now = Date.now(), timeoutMs = IDLE_TIMEOUT_MS): boolean => {
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

export const bindIdleTracking = (): void => {
  if (typeof document === "undefined") return;
  const w = window as Window & { __utiloraIdleBound?: boolean };
  if (w.__utiloraIdleBound) return;
  w.__utiloraIdleBound = true;
  if (localStorage.getItem(SESSION_KEY) && !readLastActive()) touchActivity();
  document.addEventListener("click", () => {
    try {
      if (expireIdleSession()) {
        document.dispatchEvent(new CustomEvent("utilora:idle-expired"));
        return;
      }
      if (localStorage.getItem(SESSION_KEY)) touchActivity();
    } catch {
      /* ignore */
    }
  }, true);
};
