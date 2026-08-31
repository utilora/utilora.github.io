(() => {
  if (window.__utiloraAppLoaded) return;
  window.__utiloraAppLoaded = true;

  const SESSION_KEY = "utilora_sb_session";
  const LAST_ACTIVE_KEY = "utilora_last_active";
  const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
  if (!window.__utiloraIdleBound) {
    window.__utiloraIdleBound = true;
    const last = () => Number(localStorage.getItem(LAST_ACTIVE_KEY) || 0);
    const touch = () => { try { localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch {} };
    if (localStorage.getItem(SESSION_KEY) && !last()) touch();
    document.addEventListener("click", () => {
      try {
        if (localStorage.getItem(SESSION_KEY) && last() && Date.now() - last() > IDLE_TIMEOUT_MS) {
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem(LAST_ACTIVE_KEY);
          document.dispatchEvent(new CustomEvent("utilora:idle-expired"));
          return;
        }
        if (localStorage.getItem(SESSION_KEY)) touch();
      } catch {}
    }, true);
  }

  const RECENT_KEY = "utilora_recent";
  const FAV_KEY = "utilora_favorites";
  const MAX_RECENT = 8;
  let installPrompt = null;

  const paintInstallButtons = () => {
    const installed = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone;
    document.querySelectorAll("[data-install-app]").forEach((button) => {
      button.textContent = installed ? "已安装到本机" : "安装到电脑";
      button.disabled = Boolean(installed);
      button.setAttribute("aria-disabled", String(Boolean(installed)));
    });
  };
  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); installPrompt = event; paintInstallButtons(); });
  window.addEventListener("appinstalled", () => { installPrompt = null; paintInstallButtons(); });
  const showInstallPanel = () => {
    let panel = document.getElementById("utilora-install-panel");
    if (!panel) {
      panel = document.createElement("div"); panel.id = "utilora-install-panel"; panel.className = "utilora-install-panel";
      panel.innerHTML = `<button class="utilora-install-mask" data-install-close aria-label="关闭"></button><section><button class="utilora-install-x" data-install-close aria-label="关闭">×</button><span>本地桌面版</span><h2>下次从桌面双击打开</h2><p>安装后会在桌面或开始菜单生成 Utilora 入口，已缓存页面可离线打开。</p><div class="utilora-install-actions"><button id="utilora-pwa-install">立即安装应用</button><a href="/Utilora.url" download="Utilora.url">下载 Windows 桌面快捷方式</a></div><ol><li>Chrome / Edge：优先点“立即安装应用”。</li><li>如果安装选项不可用，下载快捷方式后移到桌面。</li><li>业务数据仍在当前浏览器，请定期导出备份。</li></ol><p id="utilora-install-status" class="utilora-install-status"></p></section>`;
      const style = document.createElement("style"); style.textContent = `.utilora-install-panel{position:fixed;inset:0;z-index:9999;display:grid;grid-template-columns:1fr min(520px,94vw)}.utilora-install-mask{border:0;border-radius:0;background:rgba(8,18,38,.48)}.utilora-install-panel>section{position:relative;background:#fff;padding:34px;box-shadow:-20px 0 60px rgba(0,0,0,.2);overflow:auto;color:#162035}.utilora-install-panel h2{margin:10px 0;font-size:28px}.utilora-install-panel p,.utilora-install-panel li{color:#667085;line-height:1.7}.utilora-install-panel>section>span{color:#0f8a70;font-size:12px;font-weight:800;letter-spacing:.12em}.utilora-install-x{position:absolute;right:18px;top:14px;border:0;background:transparent;font-size:28px}.utilora-install-actions{display:flex;gap:10px;flex-wrap:wrap;margin:24px 0}.utilora-install-actions button,.utilora-install-actions a{border:0;border-radius:9px;padding:12px 16px;background:#0f8a70;color:white;text-decoration:none;font-weight:750;cursor:pointer}.utilora-install-actions a{background:#eef4f7;color:#0b1730}.utilora-install-actions button:disabled{opacity:.45;cursor:not-allowed}.utilora-install-status{font-weight:700}`; document.head.append(style); document.body.append(panel);
      panel.querySelectorAll("[data-install-close]").forEach((x) => x.onclick = () => panel.remove());
      panel.querySelector("#utilora-pwa-install").onclick = async () => { const status=panel.querySelector("#utilora-install-status"); if(!installPrompt){status.textContent="当前浏览器未提供直接安装，请使用 Windows 快捷方式，或在浏览器菜单中选择“安装应用”。";return;} status.textContent="正在请求浏览器打开安装窗口…";installPrompt.prompt();const choice=await installPrompt.userChoice;status.textContent=choice.outcome==="accepted"?"安装已确认。":"已取消安装，数据没有改变。";installPrompt=null;paintInstallButtons(); };
    }
  };
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-install-app]");
    if (!button) return;
    showInstallPanel();
  });

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
    paintInstallButtons();
  };

  boot();
})();
