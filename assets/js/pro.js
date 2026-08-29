(() => {
  // Keep this on during the launch promotion. Turn it off when payment is wired.
  const OPEN_PREVIEW = true;

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
  const label = () => (!currentUser() ? "登录后限时免费" : OPEN_PREVIEW ? "专业版限时免费" : isPro() ? "专业财务" : "免费版");

  window.UtiloraPro = {
    OPEN_PREVIEW,
    fromUser,
    plan,
    isPro,
    canAccess,
    label,
    href: "/pro/",
  };
})();