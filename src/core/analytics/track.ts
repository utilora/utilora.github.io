import { getSupabase } from "../supabase/client";
import { type AnalyticsEventName, isAnalyticsEvent } from "./events";

const sanitizeSlug = (slug?: string | null): string | null => {
  if (!slug) return null;
  const value = String(slug).trim().slice(0, 80);
  if (!value || /@/.test(value) || /\d+\.\d+/.test(value)) return null;
  return value;
};

export const trackEvent = (event: AnalyticsEventName, slug?: string | null): void => {
  try {
    if (!isAnalyticsEvent(event)) return;
    const toolSlug = sanitizeSlug(slug);
    const api = window.UtiloraAnalytics;
    if (api?.track) {
      api.track(event, toolSlug);
      return;
    }
    const client = getSupabase();
    if (!client) return;
    void client
      .rpc("track_analytics_event", {
        p_event_type: event,
        p_tool_slug: toolSlug,
        p_path: location.pathname.slice(0, 200),
        p_session_id: null,
        p_referrer: null,
        p_device: null,
        p_browser: null
      })
      .then(() => undefined, () => undefined);
  } catch {
    // Analytics must never break product flows.
  }
};

declare global {
  interface Window {
    UtiloraAnalytics?: {
      EVENTS: Record<string, AnalyticsEventName>;
      track: (event: string, slug?: string | null) => void;
    };
  }
}
