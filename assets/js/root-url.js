(() => {
  const KEY = "utilora_view";
  const isAdminPath = (path) => /^\/admin(\/|$)/.test(path || "");
  if (isAdminPath(location.pathname)) return;

  const viewOf = (loc) => loc.pathname + loc.search + loc.hash;
  const isHome = (path) => path === "/" || path === "/index.html" || path === "";
  const inFrame = () => {
    try { return window.top !== window; } catch { return true; }
  };

  const save = (view) => { try { sessionStorage.setItem(KEY, view); } catch {} };
  const read = () => { try { return sessionStorage.getItem(KEY) || ""; } catch { return ""; } };
  const clear = () => { try { sessionStorage.removeItem(KEY); } catch {} };

  const keepRoot = () => {
    if (location.pathname !== "/" || location.search) {
      history.replaceState(null, "", "/");
    }
  };

  const closeFrame = () => {
    const frame = document.getElementById("utilora-view");
    if (frame) frame.remove();
    clear();
    keepRoot();
  };

  const openFrame = (view) => {
    if (!view || isHome(view.split("?")[0].split("#")[0]) || isAdminPath(view)) {
      closeFrame();
      return;
    }
    save(view);
    keepRoot();
    let frame = document.getElementById("utilora-view");
    if (!frame) {
      frame = document.createElement("iframe");
      frame.id = "utilora-view";
      frame.title = "Utilora";
      frame.setAttribute("style", "position:fixed;inset:0;border:0;width:100%;height:100%;z-index:9999;background:#fff");
      document.documentElement.appendChild(frame);
      frame.addEventListener("load", () => {
        try {
          const loc = frame.contentWindow.location;
          if (isHome(loc.pathname)) closeFrame();
          else save(viewOf(loc));
        } catch {}
      });
    }
    if (frame.getAttribute("data-src") !== view) {
      frame.setAttribute("data-src", view);
      frame.src = view;
    }
  };

  if (!inFrame() && !isHome(location.pathname)) {
    save(viewOf(location));
    location.replace("/");
    return;
  }

  if (!inFrame() && isHome(location.pathname)) {
    const stored = read();
    if (stored && !isHome(stored.split("?")[0].split("#")[0]) && !isAdminPath(stored)) {
      openFrame(stored);
    } else {
      keepRoot();
    }
    document.addEventListener("click", (event) => {
      const a = event.target.closest && event.target.closest("a[href]");
      if (!a || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;
      let url;
      try { url = new URL(href, location.href); } catch { return; }
      if (url.origin !== location.origin) return;
      const view = url.pathname + url.search + url.hash;
      if (isAdminPath(url.pathname)) return;
      event.preventDefault();
      if (isHome(url.pathname) && !url.search) closeFrame();
      else openFrame(view);
    }, true);
  }
})();
