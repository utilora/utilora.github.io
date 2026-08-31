(() => {
  const meta = document.querySelector('meta[name="turnstile-site-key"]');
  const siteKey = (window.__TURNSTILE_SITE_KEY || (meta && meta.content) || "").trim();
  if (!siteKey) return;
  const slots = [...document.querySelectorAll("[data-turnstile-slot], #turnstile-slot")];
  if (!slots.length) return;
  slots.forEach((slot) => {
    slot.hidden = false;
  });
  window.__onTurnstile = (token) => {
    window.__turnstileToken = token;
  };
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.addEventListener("load", () => {
    if (!window.turnstile) return;
    slots.forEach((slot) => {
      if (slot.dataset.rendered === "1") return;
      slot.dataset.rendered = "1";
      window.turnstile.render(slot, {
        sitekey: siteKey,
        callback: (token) => {
          slot.setAttribute("data-token", token);
          window.__turnstileToken = token;
        },
        "error-callback": () => {
          slot.setAttribute("data-token", "");
          window.__turnstileToken = "";
        },
        "expired-callback": () => {
          slot.setAttribute("data-token", "");
          window.__turnstileToken = "";
        },
      });
    });
  });
  document.head.appendChild(script);
})();
