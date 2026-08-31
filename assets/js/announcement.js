(() => {
  if (window.__utiloraAnnouncementBound) return;
  window.__utiloraAnnouncementBound = true;
  if (/^\/admin(\/|$)/.test(location.pathname)) return;

  const API = "https://nkxgnqzdswugbjjquxfj.supabase.co";
  const KEY = "sb_publishable_IUK0swkEhqmaWKjUGv_IIQ_Y7LjtayF";
  const SESSION_SEEN = "utilora_announcement_seen";

  const session = () => {
    try {
      if (window.UtiloraAuth?.readSession) return window.UtiloraAuth.readSession();
      return JSON.parse(localStorage.getItem("utilora_sb_session") || "null");
    } catch {
      return null;
    }
  };

  const headers = (token) => ({
    apikey: KEY,
    Authorization: "Bearer " + (token || KEY),
    "Content-Type": "application/json",
  });

  const seenThisVisit = (id) => {
    try {
      return sessionStorage.getItem(SESSION_SEEN) === id;
    } catch {
      return false;
    }
  };

  const markVisit = (id) => {
    try { sessionStorage.setItem(SESSION_SEEN, id); } catch {}
  };

  const close = () => {
    const modal = document.getElementById("site-announcement");
    if (modal) modal.remove();
  };

  const show = (row, loggedIn) => {
    if (!row || !row.id || seenThisVisit(row.id)) return;
    close();
    const modal = document.createElement("aside");
    modal.id = "site-announcement";
    modal.className = "site-announcement";
    modal.innerHTML = `<button class="site-announcement-mask" type="button" data-announcement-close aria-label="关闭"></button>
      <section class="site-announcement-card">
        <h2></h2>
        <p class="site-announcement-body"></p>
        <div class="site-announcement-actions">
          <button type="button" data-announcement-close>我知道了</button>
          <button type="button" class="secondary" data-announcement-dismiss hidden>不再弹出</button>
        </div>
        <p class="hint" data-announcement-hint hidden>登录后可选择这条不再弹出。有新公告仍会提醒。</p>
      </section>`;
    modal.querySelector("h2").textContent = row.title || "公告";
    modal.querySelector(".site-announcement-body").textContent = row.body || "";
    const dismiss = modal.querySelector("[data-announcement-dismiss]");
    const hint = modal.querySelector("[data-announcement-hint]");
    if (loggedIn) dismiss.hidden = false;
    else hint.hidden = false;
    modal.addEventListener("click", async (event) => {
      const target = event.target;
      if (target.closest("[data-announcement-dismiss]")) {
        dismiss.disabled = true;
        try {
          const live = session();
          if (!live?.access_token) return;
          const response = await fetch(API + "/rest/v1/rpc/dismiss_announcement", {
            method: "POST",
            headers: headers(live.access_token),
            body: JSON.stringify({ p_id: row.id }),
          });
          if (!response.ok) throw new Error("dismiss failed");
        } catch {
          dismiss.disabled = false;
          return;
        }
        markVisit(row.id);
        close();
        return;
      }
      if (target.closest("[data-announcement-close]")) {
        markVisit(row.id);
        close();
      }
    });
    document.body.append(modal);
  };

  const style = document.createElement("style");
  style.textContent = `.site-announcement{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:24px}
.site-announcement-mask{position:absolute;inset:0;border:0;background:#0f172a73;cursor:pointer}
.site-announcement-card{position:relative;width:min(560px,100%);background:#fff;border-radius:16px;padding:22px;box-shadow:0 24px 60px #0f172a33;color:#162035}
.site-announcement-card h2{margin:0 0 10px;font-size:18px}
.site-announcement-body{margin:0 0 16px;white-space:pre-wrap;color:#475467;line-height:1.7;font-size:14px;max-height:min(50vh,360px);overflow:auto}
.site-announcement-actions{display:flex;flex-wrap:wrap;gap:8px}
.site-announcement-actions button{border:0;border-radius:9px;padding:10px 14px;background:#4f46e5;color:#fff;font-weight:750;cursor:pointer}
.site-announcement-actions .secondary{background:#eef2ff;color:#312e81}
.site-announcement .hint{margin:10px 0 0;color:#667085;font-size:12px}`;
  document.head.append(style);

  (async () => {
    const live = session();
    try {
      const response = await fetch(API + "/rest/v1/rpc/get_active_announcement", {
        method: "POST",
        headers: headers(live?.access_token),
        body: "{}",
      });
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      if (!data || !data.id) return;
      show(data, Boolean(live?.access_token));
    } catch {
      /* SQL 未执行或网络失败时不打断浏览 */
    }
  })();
})();
