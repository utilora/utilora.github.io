import { ANALYTICS_EVENTS } from "../core/analytics/events";
import { trackEvent } from "../core/analytics/track";
import { getUser } from "../core/auth/session";
import { submitPurchaseIntent, validatePurchaseIntent } from "../core/purchase-intent/service";

const STORAGE_KEY = "utilora_purchase_intent_submitted";
const DISMISS_KEY = "utilora_intent_dismissed";
const SUCCESS_TEXT = "已记录你的意向。正式版上线前会通知你，当前不会扣费。";
const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

const showMessage = (form: HTMLFormElement, text: string, error = false): void => {
  const node = form.querySelector<HTMLElement>("[data-intent-message]");
  if (!node) return;
  node.classList.toggle("error", error);
  node.textContent = text;
};

const markSubmitted = (form: HTMLFormElement): void => {
  localStorage.setItem(STORAGE_KEY, "1");
  form.dataset.submitted = "1";
  form.querySelectorAll<HTMLButtonElement>("button[type=submit]").forEach((button) => {
    button.disabled = true;
  });
  showMessage(form, SUCCESS_TEXT);
  hideIntentModal();
};

const readCaptchaToken = (form: HTMLFormElement): string => {
  const slot = form.querySelector<HTMLElement>("[data-turnstile-slot]");
  const fromSlot = slot?.getAttribute("data-token")?.trim();
  if (fromSlot) return fromSlot;
  const hidden = form.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]');
  if (hidden?.value) return hidden.value.trim();
  return String((window as Window & { __turnstileToken?: string }).__turnstileToken || "").trim();
};

const siteKey = (): string =>
  document.querySelector<HTMLMetaElement>('meta[name="turnstile-site-key"]')?.content?.trim()
  || String((window as Window & { __TURNSTILE_SITE_KEY?: string }).__TURNSTILE_SITE_KEY || "").trim();

const ensureTurnstile = (forms: HTMLFormElement[]): void => {
  const key = siteKey();
  if (!key) return;
  const slots = forms
    .map((form) => form.querySelector<HTMLElement>("[data-turnstile-slot]"))
    .filter((slot): slot is HTMLElement => Boolean(slot));
  if (!slots.length) return;
  slots.forEach((slot) => {
    slot.hidden = false;
  });
  const boot = (): void => {
    const turnstile = (window as Window & {
      turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => void };
    }).turnstile;
    if (!turnstile) return;
    slots.forEach((slot) => {
      if (slot.dataset.rendered === "1") return;
      slot.dataset.rendered = "1";
      turnstile.render(slot, {
        sitekey: key,
        callback: (token: string) => {
          slot.setAttribute("data-token", token);
          (window as Window & { __turnstileToken?: string }).__turnstileToken = token;
        },
        "error-callback": () => slot.setAttribute("data-token", ""),
        "expired-callback": () => slot.setAttribute("data-token", "")
      });
    });
  };
  if ((window as Window & { turnstile?: unknown }).turnstile) {
    boot();
    return;
  }
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`);
  if (existing) {
    existing.addEventListener("load", boot);
    return;
  }
  const script = document.createElement("script");
  script.src = TURNSTILE_SRC;
  script.async = true;
  script.addEventListener("load", boot);
  document.head.appendChild(script);
};

const bindForm = (form: HTMLFormElement): void => {
  if (form.dataset.bound === "1") return;
  form.dataset.bound = "1";
  if (localStorage.getItem(STORAGE_KEY)) {
    markSubmitted(form);
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.dataset.submitted === "1") return;
    const honeypot = form.querySelector<HTMLInputElement>('[name="website"]');
    if (honeypot?.value) {
      markSubmitted(form);
      return;
    }

    const data = new FormData(form);
    const buttons = [...form.querySelectorAll<HTMLButtonElement>("button[type=submit]")];
    buttons.forEach((button) => {
      button.disabled = true;
    });
    showMessage(form, "正在提交……");

    try {
      const payload = validatePurchaseIntent({
        email: String(data.get("email") || ""),
        use_case: String(data.get("use_case") || ""),
        company_size: String(data.get("company_size") || ""),
        intended_plan: String(data.get("intended_plan") || "pro")
      });
      await submitPurchaseIntent({ ...payload, captcha_token: readCaptchaToken(form) });
      trackEvent(ANALYTICS_EVENTS.purchase_intent);
      markSubmitted(form);
    } catch (error) {
      buttons.forEach((button) => {
        button.disabled = false;
      });
      showMessage(form, error instanceof Error ? error.message : "提交失败，请稍后重试", true);
    }
  });
};

export const hideIntentModal = (): void => {
  const modal = document.getElementById("intent-modal");
  if (modal) modal.hidden = true;
};

export const maybeShowIntentModal = (): void => {
  if (new URLSearchParams(location.search).get("demo") === "1") return;
  if (localStorage.getItem(STORAGE_KEY) || localStorage.getItem(DISMISS_KEY)) return;
  const modal = document.getElementById("intent-modal");
  if (!modal) return;
  modal.hidden = false;
};

export const bindPurchaseIntentForms = async (): Promise<void> => {
  const forms = [...document.querySelectorAll<HTMLFormElement>("[data-purchase-intent]")];
  ensureTurnstile(forms);
  forms.forEach((form) => bindForm(form));

  document.querySelectorAll("[data-intent-dismiss]").forEach((node) => {
    if (!(node instanceof HTMLElement) || node.dataset.bound === "1") return;
    node.dataset.bound = "1";
    node.addEventListener("click", () => {
      localStorage.setItem(DISMISS_KEY, "1");
      hideIntentModal();
    });
  });

  const user = await getUser().catch(() => null);
  if (!user?.email) return;
  forms.forEach((form) => {
    const emailInput = form.querySelector<HTMLInputElement>('[name="email"]');
    if (emailInput && !emailInput.value) emailInput.value = user.email ?? "";
  });
};

if (typeof window !== "undefined") {
  (window as Window & { UtiloraPurchaseIntent?: { bind: typeof bindPurchaseIntentForms } }).UtiloraPurchaseIntent = {
    bind: bindPurchaseIntentForms
  };
}
