import { bindPurchaseIntentForms } from "./app/purchase-intent";
import { getUser } from "./core/auth/session";
import { getEffectiveEntitlement } from "./core/entitlements/service";


const updateProNavigation = async (): Promise<void> => {
  const user = await getUser().catch(() => null);
  const entitlement = await getEffectiveEntitlement(user).catch(() => null);
  document.querySelectorAll<HTMLElement>("[data-pro-status]").forEach((element) => {
    element.textContent = entitlement?.proAccess ? "专业版限时免费" : "登录后限时免费";
  });
};

const stampPlanBadges = (): void => {
  document.querySelectorAll<HTMLElement>(".finance-tool-card").forEach((card) => {
    if (card.querySelector(".plan-badge")) return;
    const pro = card.getAttribute("href")?.startsWith("pro/");
    const badge = document.createElement("span");
    badge.className = `plan-badge ${pro ? "pro" : "free"}`;
    badge.textContent = pro ? "PRO · 限免" : "免费";
    card.prepend(badge);
  });
};

stampPlanBadges();
void updateProNavigation();
void bindPurchaseIntentForms();
