(() => {
  const API = "https://nkxgnqzdswugbjjquxfj.supabase.co";
  const KEY = "sb_publishable_IUK0swkEhqmaWKjUGv_IIQ_Y7LjtayF";
  const SESSION_KEY = "utilora_sb_session";
  const REDIRECT = "https://utilora.github.io/account/";
  const REG_LIMIT_FN = API + "/functions/v1/registration-limit";
  const OTP_LIMIT_FN = API + "/functions/v1/otp-rate-limit";
  const LOGIN_COOLDOWN_FN = API + "/functions/v1/login-cooldown";
  const CAPTCHA_FN = API + "/functions/v1/verify-captcha";

  const headers = (token) => ({
    apikey: KEY,
    Authorization: "Bearer " + (token || KEY),
    "Content-Type": "application/json",
    Accept: "application/json",
  });

  const friendlyError = (error, fallback) => {
    const raw = String(error && (error.message || error.msg || error) || "");
    const code = String(error && (error.code || error.error_code) || "");
    if (/registration_ip_limit|今日该网络注册/i.test(code + raw)) {
      return raw || "今日该网络注册次数已达上限，请明日再试或更换网络。";
    }
    if (/otp_rate_limit/i.test(code + raw)) {
      return raw || "验证码发送次数已达上限，请稍后再试。";
    }
    if (/login_cooldown|失败次数过多/i.test(code + raw)) {
      return raw || "登录失败次数过多，请稍后再试。";
    }
    if (/captcha_required|captcha_failed|人机验证/i.test(code + raw)) {
      return raw || "请完成人机验证后再提交。";
    }
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
      error.code = data.error_code || data.code || data.error;
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

  /** S-04: 人机验证服务端验票；purpose=register|feedback|purchase_intent */
  const verifyCaptcha = async (token, purpose) => {
    const response = await fetch(CAPTCHA_FN, {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      headers: headers(),
      body: JSON.stringify({
        action: "verify",
        token: String(token || "").trim(),
        purpose: String(purpose || "").trim().toLowerCase(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (data && data.skipped) return data;
    if (!response.ok || data.allowed === false) {
      const err = new Error(
        data.message || "请完成人机验证后再提交。",
      );
      err.code = data.error || "captcha_failed";
      err.status = response.status;
      throw err;
    }
    return data;
  };

  /** S-01: 查询当前 IP 今日是否仍可成功注册（失败时不阻断，避免误伤；真正记账在 record） */
  const checkRegistrationLimit = async () => {
    try {
      const response = await fetch(REG_LIMIT_FN, {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: headers(),
        body: JSON.stringify({ action: "check" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return { allowed: true, skipped: true };
      if (data && data.allowed === false) {
        const err = new Error(
          data.message || "今日该网络注册次数已达上限，请明日再试或更换网络。",
        );
        err.code = "registration_ip_limit_exceeded";
        err.status = 429;
        throw err;
      }
      return data;
    } catch (error) {
      if (error && error.code === "registration_ip_limit_exceeded") throw error;
      return { allowed: true, skipped: true };
    }
  };

  /** S-01: 验证成功后按 IP 记账；超限时返回错误文案（账号可能已创建，仅提示） */
  const recordRegistrationSuccess = async (accessToken) => {
    if (!accessToken) return;
    try {
      const response = await fetch(REG_LIMIT_FN, {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: headers(accessToken),
        body: JSON.stringify({ action: "record" }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 429 || data.error === "registration_ip_limit_exceeded") {
        const err = new Error(
          data.message || "今日该网络注册次数已达上限，请明日再试或更换网络。",
        );
        err.code = "registration_ip_limit_exceeded";
        err.status = 429;
        throw err;
      }
    } catch (error) {
      if (error && error.code === "registration_ip_limit_exceeded") throw error;
    }
  };

  /** S-02: 发码前检查邮箱/IP 小时限额 */
  const checkOtpRateLimit = async (email) => {
    try {
      const response = await fetch(OTP_LIMIT_FN, {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: headers(),
        body: JSON.stringify({ action: "check", email: String(email || "").trim().toLowerCase() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 429) return { allowed: true, skipped: true };
      if (data && data.allowed === false) {
        const err = new Error(
          data.message || "验证码发送次数已达上限，请稍后再试。",
        );
        err.code = "otp_rate_limit_exceeded";
        err.status = 429;
        throw err;
      }
      return data;
    } catch (error) {
      if (error && error.code === "otp_rate_limit_exceeded") throw error;
      return { allowed: true, skipped: true };
    }
  };

  /** S-02: 点发送即记账；超限则拒绝发送 */
  const recordOtpSend = async (email) => {
    const response = await fetch(OTP_LIMIT_FN, {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      headers: headers(),
      body: JSON.stringify({ action: "record", email: String(email || "").trim().toLowerCase() }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 429 || data.error === "otp_rate_limit_exceeded") {
      const err = new Error(
        data.message || "验证码发送次数已达上限，请稍后再试。",
      );
      err.code = "otp_rate_limit_exceeded";
      err.status = 429;
      throw err;
    }
    if (!response.ok) {
      return { skipped: true };
    }
    return data;
  };

  /** S-03: 登录前检查邮箱/IP 是否在冷却期 */
  const checkLoginCooldown = async (email) => {
    try {
      const response = await fetch(LOGIN_COOLDOWN_FN, {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: headers(),
        body: JSON.stringify({ action: "check", email: String(email || "").trim().toLowerCase() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 429) return { allowed: true, skipped: true };
      if (data && data.allowed === false) {
        const err = new Error(
          data.message || "登录失败次数过多，请稍后再试。",
        );
        err.code = "login_cooldown";
        err.status = 429;
        throw err;
      }
      return data;
    } catch (error) {
      if (error && error.code === "login_cooldown") throw error;
      return { allowed: true, skipped: true };
    }
  };

  /** S-03: 密码错误后记账；达上限返回冷却错误 */
  const recordLoginFailure = async (email) => {
    try {
      const response = await fetch(LOGIN_COOLDOWN_FN, {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: headers(),
        body: JSON.stringify({ action: "record_failure", email: String(email || "").trim().toLowerCase() }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 429 || data.error === "login_cooldown") {
        const err = new Error(
          data.message || "登录失败次数过多，请稍后再试。",
        );
        err.code = "login_cooldown";
        err.status = 429;
        throw err;
      }
      return data;
    } catch (error) {
      if (error && error.code === "login_cooldown") throw error;
      return { skipped: true };
    }
  };

  /** S-03: 登录成功后清零失败计数 */
  const clearLoginFailures = async (email) => {
    try {
      await fetch(LOGIN_COOLDOWN_FN, {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: headers(),
        body: JSON.stringify({ action: "clear_success", email: String(email || "").trim().toLowerCase() }),
      });
    } catch {
    }
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
    if (type === "signup") {
      try {
        await recordRegistrationSuccess(access);
      } catch {
      }
    }
    recordActivity("login", "auth", { source: "redirect", type });
    return { type };
  };

  const sendOtp = async (email, name, captchaToken) => {
    try {
      await verifyCaptcha(captchaToken, "register");
      await checkRegistrationLimit();
      await checkOtpRateLimit(email);
      await recordOtpSend(email);
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
    await checkRegistrationLimit();
    const types = ["email", "signup", "recovery"];
    let lastError;
    for (const type of types) {
      try {
        const data = await request("/auth/v1/verify", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ type, email, token: String(token).trim() }),
        });
        const session = await saveTokens(data);
        if (type === "signup" || type === "email") {
          try {
            await recordRegistrationSuccess(session.access_token);
          } catch (limitError) {
            limitError.message = friendlyError(limitError, limitError.message);
          }
        }
        recordActivity("login", "auth", { source: "otp" });
        return session;
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
      await checkLoginCooldown(email);
      const data = await request("/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email, password }),
      });
      const session = await saveTokens(data);
      await clearLoginFailures(email);
      recordActivity("login", "auth", { source: "password" });
      return session;
    } catch (error) {
      const code = String(error && (error.code || error.error_code) || "");
      const msg = String(error && error.message || "");
      if (error && error.code === "login_cooldown") {
        error.message = friendlyError(error, "登录失败次数过多，请稍后再试。");
        throw error;
      }
      if (/invalid login|invalid_credentials|invalid.*password|邮箱或密码/i.test(code + msg)) {
        try {
          await recordLoginFailure(email);
        } catch (cooldownError) {
          if (cooldownError && cooldownError.code === "login_cooldown") {
            cooldownError.message = friendlyError(cooldownError, cooldownError.message);
            throw cooldownError;
          }
        }
      }
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
      if (body && body.data) recordActivity("profile_update", "auth", {});
      return user;
    } catch (error) {
      error.message = friendlyError(error, "保存失败");
      throw error;
    }
  };

  const recordActivity = (eventType, category, detail) => {
    const session = readSession();
    if (!session || !session.access_token) return Promise.resolve();
    return request("/rest/v1/rpc/record_user_activity", {
      method: "POST",
      headers: headers(session.access_token),
      body: JSON.stringify({
        p_event_type: eventType,
        p_category: category || "auth",
        p_path: String(location.pathname || "").slice(0, 200),
        p_detail: detail || {},
      }),
    }, 1).catch(() => {});
  };

  const logout = async () => {
    await recordActivity("logout", "auth", { source: "account" });
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
    checkRegistrationLimit,
    verifyCaptcha,
  };
})();
