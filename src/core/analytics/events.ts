export const ANALYTICS_EVENTS = Object.freeze({
  homepage_view: "homepage_view",
  free_tool_use: "free_tool_use",
  pro_click: "pro_click",
  demo_enter: "demo_enter",
  login_success: "login_success",
  workspace_enter: "workspace_enter",
  bank_use: "bank_use",
  receivable_use: "receivable_use",
  month_end_use: "month_end_use",
  pricing_view: "pricing_view",
  purchase_intent: "purchase_intent"
});

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export const ANALYTICS_EVENT_LIST = Object.freeze(Object.values(ANALYTICS_EVENTS));

export const isAnalyticsEvent = (value: string): value is AnalyticsEventName =>
  (ANALYTICS_EVENT_LIST as readonly string[]).includes(value);
