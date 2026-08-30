import { ANALYTICS_EVENTS } from "../core/analytics/events";
import { trackEvent } from "../core/analytics/track";
import { getUser } from "../core/auth/session";
import { submitPurchaseIntent, validatePurchaseIntent } from "../core/purchase-intent/service";


const STORAGE_KEY = "utilora_purchase_intent_submitted";
const SUCCESS_TEXT = "已记录你的意向。正式版上线前会通知你，当前不会扣费。";

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
      await submitPurchaseIntent(payload);
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

export const bindPurchaseIntentForms = async (): Promise<void> => {
  const forms = [...document.querySelectorAll<HTMLFormElement>("[data-purchase-intent]")];
  if (!forms.length) return;
  forms.forEach((form) => bindForm(form));

  const user = await getUser().catch(() => null);
  if (!user?.email) return;
  forms.forEach((form) => {
    const emailInput = form.querySelector<HTMLInputElement>('[name="email"]');
    if (emailInput && !emailInput.value) emailInput.value = user.email ?? "";

  });
};

