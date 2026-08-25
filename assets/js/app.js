(() => {
  if (window.__utiloraAppLoaded) return;
  window.__utiloraAppLoaded = true;

  const RECENT_KEY = "utilora_recent";
  const FAV_KEY = "utilora_favorites";
  const MAX_RECENT = 8;

  const read = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };

  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota / private mode */
    }
  };

  const slugFromPath = () => {
    const match = location.pathname.match(/\/tools\/([^/]+)/);
    return match ? match[1] : null;
  };

  const syncCloud = () => {
    const auth = window.UtiloraAuth;
    if (!auth) return;
    const session = auth.readSession();
    if (!session) return;
    const name = session.user?.user_metadata?.name || auth.displayName(session.user);
    auth.updateUser({ data: { name, favorites: read(FAV_KEY), recents: read(RECENT_KEY) } }).catch(() => {});
  };

  const addRecent = (slug) => {
    if (!slug) return read(RECENT_KEY);
    const next = [slug, ...read(RECENT_KEY).filter((item) => item !== slug)].slice(0, MAX_RECENT);
    write(RECENT_KEY, next);
    syncCloud();
    return next;
  };

  const toggleFav = (slug) => {
    if (!slug) return read(FAV_KEY);
    const current = read(FAV_KEY);
    const next = current.includes(slug) ? current.filter((item) => item !== slug) : [slug, ...current];
    write(FAV_KEY, next);
    syncCloud();
    return next;
  };

  const isFav = (slug) => read(FAV_KEY).includes(slug);

  const starButton = (slug, extraClass = "") => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `star-btn ${extraClass}`.trim();
    button.dataset.slug = slug;
    const paint = () => {
      const on = isFav(slug);
      button.setAttribute("aria-pressed", on ? "true" : "false");
      button.setAttribute("aria-label", on ? "取消收藏" : "收藏");
      button.title = on ? "取消收藏" : "收藏";
      button.innerHTML = on
        ? '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 3.6l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 18.5l.9-5.4L4.2 9.3l5.4-.8z"/></svg>'
        : '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 4.2l2.1 4.4 4.8.7-3.5 3.4.8 4.8L12 15.3 7.8 17.5l.8-4.8L5.1 9.3l4.8-.7z"/></svg>';
    };
    paint();
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFav(slug);
      paint();
      document.dispatchEvent(new CustomEvent("utilora:favorites", { detail: { slug } }));
    });
    return button;
  };

  const ensureHeadLinks = () => {
    const add = (rel, href, attrs = {}) => {
      if (document.querySelector(`link[rel="${rel}"][href="${href}"]`)) return;
      const link = document.createElement("link");
      link.rel = rel;
      link.href = href;
      Object.entries(attrs).forEach(([key, value]) => link.setAttribute(key, value));
      document.head.append(link);
    };
    add("icon", "/favicon.svg", { type: "image/svg+xml" });
    add("manifest", "/site.webmanifest");
  };

  const registerWorker = () => {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  };

  const initToolChrome = (slug) => {
    addRecent(slug);
    const nav = document.querySelector(".tool-head nav");
    if (nav && !nav.querySelector(".star-btn")) nav.append(starButton(slug, "tool-star"));
    if (/\/(pro|admin|login|account)(\/|$)/.test(location.pathname)) return;
    if (document.querySelector(".promo-bar")) return;
    const bar = document.createElement("div");
    bar.className = "promo-bar";
    bar.innerHTML = '<a href="/pro/"><b>本地财务台 Beta</b>　数据不上传，请定期导出备份 →</a>';
    document.body.prepend(bar);
  };

  window.Utilora = {
    recent: () => read(RECENT_KEY),
    favorites: () => read(FAV_KEY),
    addRecent,
    toggleFav,
    isFav,
    starButton,
  };

  const boot = () => {
    ensureHeadLinks();
    registerWorker();
    const slug = slugFromPath();
    if (slug) initToolChrome(slug);
  };

  boot();
})();
