(() => {
  if (window.__utiloraAppLoaded) return;
  window.__utiloraAppLoaded = true;

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

  const commercializeHome = () => {
    if (location.pathname !== "/" && !location.pathname.endsWith("/index.html")) return;
    const heroLabel = document.querySelector(".hero-label");
    const heroTitle = document.querySelector(".hero-copy h1");
    const heroText = document.querySelector(".hero-copy > p");
    const actions = document.querySelector(".hero-actions");
    const notice = document.querySelector(".notice-bar");
    if (!heroLabel || !heroTitle || !heroText || !actions) return;

    heroLabel.textContent = "免费财务工具 + 专业财务工作台";
    heroTitle.innerHTML = "把日常财务问题<br><em>更快变成可交付的工作结果</em>";
    heroText.textContent = "免费工具永久免费、匿名、无需登录；需要连续管理时，再用专业财务工作台处理银行流水、应收回款、月结检查和经营报表。";
    if (notice) notice.innerHTML = '<strong>Pro 当前内测免费</strong> · 预计 ¥19/月 · 正式收费前提前通知 · 免费工具永久免费。<a href="pro/?demo=1#/dashboard">体验演示</a>';

    const primary = actions.querySelector(".primary-cta");
    const pro = actions.querySelector(".pro-cta");
    if (primary) primary.innerHTML = '免费开始使用 <span>→</span>';
    if (pro) {
      pro.textContent = "体验完整演示";
      pro.href = "pro/?demo=1#/dashboard";
    }

    if (!document.querySelector(".home-pro-value-grid")) {
      const price = document.createElement("p");
      price.className = "home-price-preview";
      price.textContent = "Pro 预计 ¥19/月 · 当前内测免费 · 正式收费前提前通知";
      actions.insertAdjacentElement("afterend", price);

      const values = document.createElement("div");
      values.className = "home-pro-value-grid";
      values.setAttribute("aria-label", "Pro 核心价值");
      values.innerHTML = '<a href="pro/?demo=1#/bank"><b>银行流水</b><span>导入流水，减少重复录入</span></a><a href="pro/?demo=1#/receivables"><b>应收回款</b><span>跟踪应收与收款进度</span></a><a href="pro/?demo=1#/checks"><b>月结检查</b><span>集中发现月末异常</span></a><a href="pro/?demo=1#/bookkeeping"><b>经营报表</b><span>从业务记录看到经营结果</span></a>';
      price.insertAdjacentElement("afterend", values);

      const style = document.createElement("style");
      style.textContent = '.home-price-preview{margin:14px 0 10px;color:#536174;font-size:14px;font-weight:700}.home-pro-value-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0 18px}.home-pro-value-grid a{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border:1px solid rgba(15,138,112,.18);border-radius:12px;background:rgba(255,255,255,.72);color:inherit;text-decoration:none}.home-pro-value-grid b{font-size:14px;color:#0b1730}.home-pro-value-grid span{font-size:12px;line-height:1.45;color:#667085}@media(max-width:760px){.home-pro-value-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}';
      document.head.append(style);
    }
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
    commercializeHome();
    paintInstallButtons();
  };

  boot();
})();
