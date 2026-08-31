import { environment } from "../../app/config/env";
import { getSupabase } from "../supabase/client";

export const PURCHASE_INTENT_USE_CASES = ["银行流水", "应收回款", "月结检查", "经营报表", "其他"] as const;
export const PURCHASE_INTENT_COMPANY_SIZES = ["1-10", "11-50", "51-200", "200+"] as const;

export interface PurchaseIntentInput {
  email: string;
  use_case: string | null;
  company_size: string | null;
  intended_plan: "pro";
  captcha_token?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validatePurchaseIntent = (input: {
  email: string;
  use_case?: string | null;
  company_size?: string | null;
  intended_plan?: string | null;
}): Omit<PurchaseIntentInput, "captcha_token"> => {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) throw new Error("请填写有效邮箱");

  const use_case = input.use_case?.trim() || null;
  if (use_case && !PURCHASE_INTENT_USE_CASES.includes(use_case as (typeof PURCHASE_INTENT_USE_CASES)[number])) {
    throw new Error("请选择主要用途");
  }

  const company_size = input.company_size?.trim() || null;
  if (company_size && !PURCHASE_INTENT_COMPANY_SIZES.includes(company_size as (typeof PURCHASE_INTENT_COMPANY_SIZES)[number])) {
    throw new Error("请选择公司规模");
  }

  if ((input.intended_plan || "pro") !== "pro") throw new Error("当前仅开放 Pro 意向");

  return { email, use_case, company_size, intended_plan: "pro" };
};

export const submitPurchaseIntent = async (input: PurchaseIntentInput): Promise<void> => {
  if (!environment.supabaseUrl || !environment.supabaseAnonKey) {
    throw new Error("服务暂不可用，请稍后重试");
  }
  const client = getSupabase();
  const accessToken = client
    ? (await client.auth.getSession()).data.session?.access_token
    : null;
  const response = await fetch(`${environment.supabaseUrl}/functions/v1/submit-purchase-intent`, {
    method: "POST",
    credentials: "omit",
    cache: "no-store",
    headers: {
      apikey: environment.supabaseAnonKey,
      Authorization: `Bearer ${accessToken || environment.supabaseAnonKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      captcha_token: input.captcha_token || "",
      email: input.email,
      use_case: input.use_case,
      company_size: input.company_size,
      intended_plan: input.intended_plan
    })
  });
  const data = await response.json().catch(() => ({})) as { message?: string; error?: string };
  if (response.status === 429) {
    throw new Error(data.message || "提交次数已达上限，请稍后再试。");
  }
  if (!response.ok) {
    throw new Error(data.message || "提交失败，请稍后重试");
  }
};
