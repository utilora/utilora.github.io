(() => {
  const API = "https://nkxgnqzdswugbjjquxfj.supabase.co";
  const KEY = "sb_publishable_IUK0swkEhqmaWKjUGv_IIQ_Y7LjtayF";
  const SESSION_KEY = "utilora_sb_session";
  const REDIRECT = "https://utilora.github.io/account/";

  const headers = (token) => ({
    apikey: KEY,
    Authorization: "Bearer " + (token || KEY),
    "Content-Type": "application/json",
    Accept: "application/json",
  });

  const friendlyError = (error, fallback) => {
    const raw = String(error && (error.message || error.msg || error) || "");
    const code = String(error && (error.code || error.error_code) || "");
    if (/rate_limit|too many|429/i.test(code + raw)) return "发信通道这小时次数已用完（不是你点错）。请稍后再发验证码。";
    if (/otp_expired|expired/i.test(code + raw)) return "验证码已过期，请重新发送。";
    if (/invalid.*token|otp_disabled|token.*invalid/i.test(code + raw)) return "验证码不对，请核对后重试。";
    if (/redirect_to|not allowed|whitelist/i.test(raw)) return "回调地址未配置，请稍后再试。";
    if (/invalid.*email|email_address_invalid/i.test(code + raw)) return "这个邮箱地址不被接受，请换一个常用邮箱。";
    if (/already.?registered|user_already_exists|already been registered/i.test(code + raw)) return "这个邮箱已经注册。请直接登录，或点「忘记密码」。";
    if (/confirm|not.*verified|email_not_confirmed/i.test(code + raw)) return "邮箱尚未验证。请先填写验证码。";
    if (/invalid login|invalid_credentials|invalid.*password/i.test(code + raw)) return "邮箱或密码不对。";
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(raw) || error && error.name === "TypeError") {
      return "连不上登录服务。请关闭广告拦截后重试；若在公司网或大陆网络，可能需要畅通的国际网络。";
    }
    return fallback || raw || "请求失败";
  };

  const readSession = () => {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  };

  const writeSession = (session) => localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  const clearSession = () => localStorage.removeItem(SESSION_KEY);

  const parseJson = async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.msg || data.error_description || data.error || data.message || "请求失败");
      error.code = data.error_code || data.code;
      error.status = response.status;
      throw error;
    }
    return data;
  };

  const request = async (path, options = {}, tries = 2) => {
    let lastError;
    for (let i = 0; i < tries; i += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 18000);
      try {
        const response = await fetch(API + path, {
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
          ...options,
        });
        clearTimeout(timer);
        return parseJson(response);
      } catch (error) {
        clearTimeout(timer);
        lastError = error;
        if (error && error.status) throw error;
        if (i + 1 < tries) await new Promise((resolve) => setTimeout(resolve, 700 * (i + 1)));
      }
    }
    throw lastError;
  };

  const fetchUser = (token) => request("/auth/v1/user", { headers: headers(token) });

  const saveTokens = async (payload) => {
    const access = payload.access_token;
    const refresh = payload.refresh_token;
    const user = payload.user || (await fetchUser(access));
    const session = {
      access_token: access,
      refresh_token: refresh,
      expires_at: payload.expires_at || Math.floor(Date.now() / 1000) + (payload.expires_in || 3600),
      user,
    };
    writeSession(session);
    return session;
  };

  const refreshIfNeeded = async () => {
    const session = readSession();
    if (!session) return null;
    const skew = 60;
    if (session.expires_at && session.expires_at - skew > Date.now() / 1000) return session;
    if (!session.refresh_token) {
      clearSession();
      return null;
    }
    try {
      const data = await request("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      return saveTokens(data);
    } catch {
      clearSession();
      return null;
    }
  };

  const captureRedirect = async () => {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const search = new URLSearchParams(location.search);
    const error = hash.get("error_description") || search.get("error_description") || search.get("error");
    if (error) {
      history.replaceState({}, "", location.pathname);
      return { error: decodeURIComponent(error.replace(/\+/g, " ")) };
    }
    const access = hash.get("access_token");
    const refresh = hash.get("refresh_token");
    if (!access) return null;
    const type = hash.get("type") || search.get("type") || "";
    await saveTokens({
      access_token: access,
      refresh_token: refresh,
      expires_in: Number(hash.get("expires_in") || 3600),
    });
    history.replaceState({}, "", location.pathname);
    return { type };
  };

  const sendOtp = async (email, name) => {
    try {
      return await request("/auth/v1/otp", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          email,
          create_user: true,
          data: name ? { name } : {}
        })
      });
    } catch (error) {
      error.message = friendlyError(error, "验证码发送失败");
      throw error;
    }
  };

  const signup = async (email, password, name) => sendOtp(email, name);

  const verifyOtp = async (email, token) => {
    const types = ["email", "signup", "recovery"];
    let lastError;
    for (const type of types) {
      try {
        const data = await request("/auth/v1/verify", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ type, email, token: String(token).trim() }),
        });
        return saveTokens(data);
      } catch (error) {
        lastError = error;
      }
    }
    lastError.message = friendlyError(lastError, "验证码不对");
    throw lastError;
  };

  const setPassword = async (password) => {
    try {
      return await updateUser({ password });
    } catch (error) {
      error.message = friendlyError(error, "密码保存失败");
      throw error;
    }
  };

  const login = async (email, password) => {
    try {
      const data = await request("/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email, password }),
      });
      return saveTokens(data);
    } catch (error) {
      error.message = friendlyError(error, "登录失败");
      throw error;
    }
  };

  const recover = async (email) => {
    try {
      return await request("/auth/v1/recover?redirect_to=" + encodeURIComponent(REDIRECT), {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email }),
      });
    } catch (error) {
      error.message = friendlyError(error, "发送失败");
      throw error;
    }
  };

  const resend = async (email, name) => sendOtp(email, name);

  const updateUser = async (body) => {
    const session = await refreshIfNeeded();
    if (!session) throw new Error("请先登录");
    try {
      const user = await request("/auth/v1/user", {
        method: "PUT",
        headers: headers(session.access_token),
        body: JSON.stringify(body),
      });
      writeSession({ ...session, user });
      return user;
    } catch (error) {
      error.message = friendlyError(error, "保存失败");
      throw error;
    }
  };

  const logout = async () => {
    const session = readSession();
    if (session && session.access_token) {
      await request("/auth/v1/logout", { method: "POST", headers: headers(session.access_token) }).catch(() => {});
    }
    clearSession();
  };

  const ping = async () => {
    try {
      await request("/auth/v1/settings", { headers: headers() }, 1);
      return true;
    } catch {
      return false;
    }
  };

  const displayName = (user) => (user && user.user_metadata && user.user_metadata.name) || (user && user.email && user.email.split("@")[0]) || "账号";
  const isVerified = (user) => Boolean(user && (user.email_confirmed_at || user.confirmed_at || (user.user_metadata && user.user_metadata.email_verified)));

  const isDisabled = async () => {
    const session = await refreshIfNeeded();
    if (!session) return false;
    try {
      const data = await request("/rest/v1/rpc/account_is_disabled", {
        method: "POST",
        headers: headers(session.access_token),
        body: "{}",
      }, 1);
      return data === true;
    } catch {
      return false;
    }
  };

  window.UtiloraAuth = {
    readSession,
    refreshIfNeeded,
    captureRedirect,
    sendOtp,
    verifyOtp,
    setPassword,
    signup,
    login,
    recover,
    resend,
    updateUser,
    logout,
    isDisabled,
    ping,
    displayName,
    isVerified,
    friendlyError,
  };
})();
