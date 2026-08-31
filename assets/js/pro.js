(() => {
  let OPEN_PREVIEW = true;

  const fromUser = (user) => {
    if (!user) return "guest";
    if (OPEN_PREVIEW) return "pro";
    const meta = (user && user.user_metadata) || {};
    if (meta.plan === "pro" || meta.pro === true) return "pro";
    if (meta.pro_until && Date.parse(meta.pro_until) > Date.now()) return "pro";
    return "free";
  };

  const currentUser = () => {
    const auth = window.UtiloraAuth;
    if (auth && auth.readSession) {
      const session = auth.readSession();
      return session && session.user;
    }
    try {
      const session = JSON.parse(localStorage.getItem("utilora_sb_session") || "null");
      return session && session.user;
    } catch {
      return null;
    }
  };

  const plan = () => fromUser(currentUser());
  const isPro = () => plan() === "pro";
  const canAccess = () => Boolean(currentUser()) && isPro();
  const label = () => (!currentUser() ? "登录后使用专业版" : OPEN_PREVIEW ? "专业版限时免费" : isPro() ? "专业财务" : "免费版");

  const refreshLaunchPromo = async () => {
    const auth = window.UtiloraAuth;
    const session = auth && auth.readSession ? auth.readSession() : null;
    if (!session || !session.access_token) return;
    try {
      const response = await fetch("https://nkxgnqzdswugbjjquxfj.supabase.co/rest/v1/promotions?code=eq.pro-launch-free&select=code", {
        headers: {
          apikey: "sb_publishable_IUK0swkEhqmaWKjUGv_IIQ_Y7LjtayF",
          Authorization: "Bearer " + session.access_token,
        },
      });
      const rows = await response.json().catch(() => []);
      OPEN_PREVIEW = Array.isArray(rows) && rows.length > 0;
    } catch {
      /* 保持当前值 */
    }
  };

  window.UtiloraPro = {
    get OPEN_PREVIEW() { return OPEN_PREVIEW; },
    fromUser,
    plan,
    isPro,
    canAccess,
    label,
    href: "/pro/",
    refreshLaunchPromo,
  };

  void refreshLaunchPromo();
})();