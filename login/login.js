(() => {
  const auth = window.UtiloraAuth;
  const NAMES = ["林深", "江晚", "青石", "远山", "清风", "南星", "北岸", "暮雪", "顾言", "沈衡", "苏晚", "白舟", "陆深", "叶宁", "陈予"];

  const title = document.getElementById("title");
  const lead = document.getElementById("lead");
  const form = document.getElementById("auth-form");
  const nameField = document.getElementById("name-field");
  const confirmField = document.getElementById("confirm-field");
  const passwordField = document.getElementById("password-field");
  const otpField = document.getElementById("otp-field");
  const strength = document.getElementById("strength");
  const submit = document.getElementById("submit");
  const toggleMode = document.getElementById("toggle-mode");
  const toggleRecover = document.getElementById("toggle-recover");
  const resend = document.getElementById("resend");
  const banner = document.getElementById("banner");
  const formMsg = document.getElementById("form-msg");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmInput = document.getElementById("confirm");
  const otpInput = document.getElementById("otp");
  const nameInput = document.getElementById("name");
  const randomName = document.getElementById("random-name");

  let mode = "in";
  let pendingEmail = "";
  let pendingPassword = "";
  let pendingName = "";
  let cooldown = 0;
  let cooldownTimer = 0;

  const setMsg = (el, text, error = false) => {
    el.className = error ? "message error" : "message";
    el.textContent = text || "";
  };

  const passwordIssue = (password, confirm) => {
    if (password.length < 8) return "密码至少 8 位";
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "请同时包含字母和数字";
    if (confirm !== undefined && password !== confirm) return "两次密码不一致";
    return null;
  };

  const paint = () => {
    const isUp = mode === "up";
    const isRecover = mode === "recover";
    const isVerify = mode === "verify";
    const isReset = mode === "reset";
    title.textContent = isUp ? "创建账号" : isRecover ? "重置密码" : isVerify ? "验证邮箱" : isReset ? "设置新密码" : "登录";
    lead.textContent = isUp
      ? "使用真实邮箱。我们会发送验证码，验证成功后才能登录。"
      : isRecover
        ? "输入注册邮箱，我们会发送重置邮件。"
        : isVerify
          ? `验证码已发送到 ${pendingEmail}，请输入邮件中的数字验证码。`
          : isReset
            ? "请设置新密码，保存后进入账号页。"
            : "使用已验证的邮箱登录。工具本身仍可免登录使用。";
    nameField.hidden = !isUp;
    confirmField.hidden = !(isUp || isReset);
    passwordField.hidden = isRecover || isVerify;
    otpField.hidden = !isVerify;
    passwordInput.required = !isRecover && !isVerify;
    confirmInput.required = isUp || isReset;
    otpInput.required = isVerify;
    emailInput.readOnly = isVerify || isReset;
    submit.textContent = isUp ? "发送验证码" : isRecover ? "发送重置邮件" : isVerify ? "验证并完成注册" : isReset ? "保存新密码" : "登录";
    toggleMode.textContent = isUp || isRecover || isVerify || isReset ? "返回登录" : "没有账号？注册";
    toggleRecover.hidden = isRecover || isVerify || isReset;
    resend.hidden = !pendingEmail || !isVerify;
    resend.textContent = cooldown > 0 ? resend.textContent : "重新发送验证码";
    strength.hidden = !(isUp && passwordInput.value);
  };

  const goAccount = () => {
    const next = new URLSearchParams(location.search).get("next");
    const allowed = next && /^(?:\.\.\/|\.\/|\/)(?!\/)/.test(next) && !/^javascript:|^data:/i.test(next);
    location.href = allowed ? next : "../account/";
  };

  const goLoggedInHome = () => {
    location.href = "../account/";
  };

  const trackLoginSuccess = () => {
    try {
      const analytics = window.UtiloraAnalytics;
      if (analytics?.EVENTS?.login_success) analytics.track(analytics.EVENTS.login_success);
    } catch {}
  };

  const readCaptchaToken = () => {
    const input = document.querySelector('[name="cf-turnstile-response"]');
    if (input && input.value) return input.value.trim();
    if (window.__turnstileToken) return String(window.__turnstileToken).trim();
    return "";
  };



  const startCooldown = (seconds) => {
    cooldown = seconds;
    resend.disabled = true;
    const tick = () => {
      if (cooldown <= 0) {
        resend.disabled = false;
        resend.textContent = "重新发送验证码";
        return;
      }
      resend.textContent = "重新发送（" + cooldown + "s）";
      cooldown -= 1;
      cooldownTimer = window.setTimeout(tick, 1000);
    };
    window.clearTimeout(cooldownTimer);
    tick();
  };

  (async () => {
    try {
      const captured = await auth.captureRedirect();
      const wantReset = new URLSearchParams(location.search).get("reset") === "1";
      if (captured && captured.error) {
        setMsg(banner, captured.error, true);
        return;
      }
      if ((captured && captured.type === "recovery") || wantReset) {
        mode = "reset";
        const session = await auth.refreshIfNeeded();
        if (session?.user?.email) emailInput.value = session.user.email;
        paint();
        setMsg(formMsg, "请设置新密码后继续。");
        return;
      }
      if (captured) {
        goLoggedInHome();
        return;
      }
      const session = await auth.refreshIfNeeded();
      if (session) goLoggedInHome();
    } catch {
      /* 留在登录页 */
    }
  })();

  randomName.addEventListener("click", () => {
    nameInput.value = NAMES[Math.floor(Math.random() * NAMES.length)];
  });

  passwordInput.addEventListener("input", () => {
    if (mode !== "up") return;
    const value = passwordInput.value;
    if (!value) {
      strength.hidden = true;
      return;
    }
    let score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    const label = score <= 1 ? "弱" : score === 2 ? "一般" : score === 3 ? "较好" : "强";
    strength.hidden = false;
    strength.textContent = "密码强度：" + label;
  });

  toggleMode.addEventListener("click", () => {
    mode = mode === "in" ? "up" : "in";
    pendingEmail = "";
    emailInput.readOnly = false;
    setMsg(formMsg, "");
    paint();
  });

  toggleRecover.addEventListener("click", () => {
    mode = "recover";
    pendingEmail = "";
    setMsg(formMsg, "");
    paint();
  });

  const sendMail = async (email, name, password) => {
    pendingPassword = password || pendingPassword;
    pendingName = name || pendingName;
    await auth.sendOtp(email, pendingName, readCaptchaToken());
    pendingEmail = email;
    mode = "verify";
    startCooldown(60);
    paint();
    setMsg(formMsg, "验证码已发送到 " + email + "。请按邮件里的完整数字填写（6 到 8 位）；QQ / 网易邮箱请同时检查垃圾箱。");
  };

  resend.addEventListener("click", async () => {
    if (!pendingEmail || cooldown > 0) return;
    resend.disabled = true;
    try {
      await auth.resend(pendingEmail, pendingName);
      startCooldown(60);
      setMsg(formMsg, "新的验证码已发送，请查收邮件。");
    } catch (error) {
      setMsg(formMsg, error.message || "发送失败", true);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const confirm = confirmInput.value;
    const name = nameInput.value.trim() || email.split("@")[0];
    submit.disabled = true;
    setMsg(formMsg, "请稍候…");
    try {
      if (mode === "recover") {
        await auth.recover(email);
        setMsg(formMsg, "如果该邮箱已注册，重置邮件已发出。请同时检查垃圾箱。点邮件里的链接后设置新密码。");
        return;
      }
      if (mode === "reset") {
        const issue = passwordIssue(password, confirm);
        if (issue) throw new Error(issue);
        await auth.setPassword(password);
        trackLoginSuccess();
        goLoggedInHome();
        return;
      }
      if (mode === "verify") {
        const token = otpInput.value.trim();
        if (!/^\d{6,8}$/.test(token)) throw new Error("请输入邮件中的 6 到 8 位验证码");
        await auth.verifyOtp(pendingEmail || email, token);
        if (pendingPassword) {
          try { await auth.setPassword(pendingPassword); } catch { /* 会话已建立时密码稍后可在账户页设置 */ }
        }
        if (await auth.isDisabled()) {
          await auth.logout();
          throw new Error("账号已被停用，请联系管理员");
        }
        pendingPassword = "";
        trackLoginSuccess();
        goAccount();

        return;
      }
      if (mode === "up") {
        const issue = passwordIssue(password, confirm);
        if (issue) throw new Error(issue);
        await sendMail(email, name, password);
        return;
      }
      try {
        await auth.login(email, password);
        if (await auth.isDisabled()) {
          await auth.logout();
          throw new Error("账号已被停用，请联系管理员");
        }
        trackLoginSuccess();
        goAccount();

      } catch (error) {
        if (/尚未验证|not_confirmed|confirm/i.test((error.code || "") + error.message)) {
          await sendMail(email, name, password);
          return;
        }
        throw error;
      }
    } catch (error) {
      setMsg(formMsg, error.message || "登录失败", true);
    } finally {
      submit.disabled = false;
    }
  });

  paint();
})();
