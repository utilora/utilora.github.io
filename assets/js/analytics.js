(() => {
  const EVENTS = Object.freeze({
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
    purchase_intent: "purchase_intent",
  });
  const ALLOWED = new Set(["page_view", "tool_use", ...Object.values(EVENTS)]);
  const script = document.currentScript;
  const tool = script?.dataset.tool || null;
  const url = "https://nkxgnqzdswugbjjquxfj.supabase.co/rest/v1/rpc/track_analytics_event";
  const apikey = "sb_publishable_IUK0swkEhqmaWKjUGv_IIQ_Y7LjtayF";
  const key = "utilora_visitor_id";
  let sessionId;
  try {
    sessionId = localStorage.getItem(key) || crypto.randomUUID();
    localStorage.setItem(key, sessionId);
  } catch {
    sessionId = crypto.randomUUID();
  }
  const ua = navigator.userAgent;
  const device = /Mobi|Android|iPhone/i.test(ua) ? "mobile" : /iPad|Tablet/i.test(ua) ? "tablet" : "desktop";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Other";
  let referrer = "direct";
  try {
    if (document.referrer) referrer = new URL(document.referrer).hostname || "direct";
  } catch {}
  const isHome = location.pathname.replace(/\/index\.html$/i, "").replace(/\/+$/, "") === "";

  const ACCOUNT_EVENTS = new Set([
    "pro_click",
    "demo_enter",
    "workspace_enter",
    "bank_use",
    "receivable_use",
    "month_end_use",
    "pricing_view",
    "purchase_intent",
  ]);

  function recordAccountActivity(eventType, toolSlug) {
    if (!ACCOUNT_EVENTS.has(eventType)) return;
    let session;
    try {
      session = JSON.parse(localStorage.getItem("utilora_sb_session") || "null");
    } catch {
      return;
    }
    if (!session || !session.access_token) return;
    fetch(url.replace("track_analytics_event", "record_user_activity"), {
      method: "POST",
      keepalive: true,
      headers: {
        apikey,
        Authorization: "Bearer " + session.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_event_type: eventType,
        p_category: "product",
        p_path: location.pathname.slice(0, 200),
        p_detail: toolSlug ? { tool: toolSlug } : {},
      }),
    }).catch(() => {});
  }

  function track(eventType, toolSlug = null) {
    try {
      if (!ALLOWED.has(eventType)) return;
      const slug = toolSlug == null ? null : String(toolSlug).trim().slice(0, 80);
      if (slug && (/@/.test(slug) || /\d+\.\d+/.test(slug))) return;
      fetch(url, {
        method: "POST",
        keepalive: true,
        headers: { apikey, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_event_type: eventType,
          p_tool_slug: slug,
          p_path: location.pathname.slice(0, 200),
          p_session_id: sessionId,
          p_referrer: referrer,
          p_device: device,
          p_browser: browser,
        }),
      }).catch(() => {});
      recordAccountActivity(eventType, slug);
    } catch {}
  }

  window.UtiloraAnalytics = Object.freeze({ EVENTS, track });

  track("page_view", tool);
  if (tool) {
    track("tool_use", tool);
    track(EVENTS.free_tool_use, tool);
  }
  if (isHome) {
    track(EVENTS.homepage_view);
    document.addEventListener("click", (event) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link) return;
      const href = link.getAttribute("href") || "";
      if (/(?:^|\/)pro\/?/.test(href)) track(EVENTS.pro_click);
    });
    let pricingSeen = false;
    const markPricing = () => {
      if (pricingSeen) return;
      pricingSeen = true;
      track(EVENTS.pricing_view);
    };
    if (/^#(?:compare|intent)$/.test(location.hash)) markPricing();
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) markPricing();
      }, { threshold: 0.35 });
      ["compare", "intent"].forEach((id) => {
        const node = document.getElementById(id);
        if (node) observer.observe(node);
      });
    }
  }

  if (script?.src && !window.__utiloraAppLoaded) {
    const app = document.createElement("script");
    app.src = new URL("app.js", script.src).href;
    document.head.append(app);
  }
})();
