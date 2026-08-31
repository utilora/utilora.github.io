import * as UtiloraBackup from "./core/backup/local";
import * as UtiloraBank from "./core/banking/local";
import * as UtiloraBankQueue from "./core/banking/queue";
import * as UtiloraMonthEnd from "./core/month-end/local";
import * as UtiloraReceivables from "./core/receivables/local";
import { bindPurchaseIntentForms } from "./app/purchase-intent";
import { ANALYTICS_EVENTS } from "./core/analytics/events";
import { trackEvent } from "./core/analytics/track";
import { getUser } from "./core/auth/session";
import { getEffectiveEntitlement, resolveLocalEntitlement } from "./core/entitlements/service";

declare global {
  interface Window {
    UtiloraBank: typeof UtiloraBank;
    UtiloraBankQueue: typeof UtiloraBankQueue;
    UtiloraReceivables: typeof UtiloraReceivables;
    UtiloraMonthEnd: typeof UtiloraMonthEnd;
    UtiloraBackup: typeof UtiloraBackup;
  }
}

const gate = document.getElementById("pro-gate") as HTMLElement;
const shell = document.getElementById("pro-shell") as HTMLElement;
const status = document.getElementById("pro-account-status");
const demo = new URLSearchParams(location.search).get("demo") === "1";
const STARTUP_TIMEOUT_MS = 4000;

export const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), timeoutMs))
  ]);

const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });

let workspaceLoaded = false;
const loadWorkspace = async (): Promise<void> => {
  if (workspaceLoaded) return;
  window.UtiloraBank = UtiloraBank;
  window.UtiloraBankQueue = UtiloraBankQueue;
  window.UtiloraReceivables = UtiloraReceivables;
  window.UtiloraMonthEnd = UtiloraMonthEnd;
  window.UtiloraBackup = UtiloraBackup;
  try {
    for (const src of [
      "../assets/js/finance.js?v=11",
      "../assets/js/csv.js?v=11",
      "../assets/js/xlsx-lite.js?v=11",
      "../assets/js/app.js?v=13",
      "app.js?v=19"
    ]) {
      await loadScript(src);
    }
    await loadScript("u01.js?v=1").catch(() => undefined);
    workspaceLoaded = true;
  } catch (error) {
    workspaceLoaded = false;
    throw error;
  }
};

const revealWorkspace = async (label: string): Promise<void> => {
  gate.hidden = true;
  shell.hidden = false;
  if (status) {
    status.textContent = label;
    status.classList.remove("error");
  }
  await loadWorkspace();
};

const start = async (): Promise<void> => {
  if (demo) {
    await revealWorkspace("演示模式 · 不保存改动");
    trackEvent(ANALYTICS_EVENTS.demo_enter);
    await bindPurchaseIntentForms();
    return;
  }

  const user = await withTimeout(getUser(), STARTUP_TIMEOUT_MS, null);
  const entitlement = user
    ? await withTimeout(getEffectiveEntitlement(user), STARTUP_TIMEOUT_MS, resolveLocalEntitlement(user))
    : resolveLocalEntitlement(null);
  if (user && entitlement.proAccess) {
    const name = user.user_metadata?.name || user.email?.split("@")[0] || "账户";
    await revealWorkspace(`${name} · 专业版限时免费`);
    trackEvent(ANALYTICS_EVENTS.workspace_enter);
    await bindPurchaseIntentForms();
    return;
  }

  shell.hidden = true;
  gate.hidden = false;
  if (status) status.textContent = "请登录后使用";
  const login = gate.querySelector<HTMLAnchorElement>("[data-pro-login]");
  if (login) login.href = "../login/?next=" + encodeURIComponent("../pro/");
  await bindPurchaseIntentForms();
};

void start().catch(async (error) => {
  console.error("Professional workspace bootstrap failed", error);
  if (demo) {
    try {
      await revealWorkspace("演示模式 · 不保存改动");
      await bindPurchaseIntentForms();
      return;
    } catch {
      if (status) {
        status.textContent = "演示工作台加载失败，请刷新";
        status.classList.add("error");
      }
    }
  } else if (status) {
    status.textContent = "登录验证失败，请重试";
    status.classList.add("error");
  }
  if (!demo) {
    shell.hidden = true;
    gate.hidden = false;
  }
  await bindPurchaseIntentForms();
});
