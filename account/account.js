(() => {
  const auth = window.UtiloraAuth;
  const names = {
    "json-formatter": "JSON 格式化",
    timestamp: "时间戳转换",
    base64: "Base64 编解码",
    "qr-code": "二维码",
    "password-generator": "密码生成器",
    "text-counter": "文本统计",
    "url-codec": "URL 编解码",
    "hash-generator": "Hash 生成器",
    "uuid-generator": "UUID 生成器",
    "regex-tester": "正则测试",
    "color-converter": "颜色转换",
    "case-converter": "大小写转换",
    "text-diff": "文本对比",
    "jwt-decoder": "JWT 解码",
    "cron-explainer": "Cron 表达式解释",
    "url-parser": "URL 解析器",
    "number-base": "进制转换",
    "unit-converter": "单位换算",
    "html-entities": "HTML 实体编解码",
    "random-number": "随机数生成器",
    "douyin-downloader": "抖音视频下载",
    "image-compress": "图片压缩",
    "number-chinese": "数字转中文大写",
    "id-card": "身份证校验",
    "zh-convert": "简繁拼音",
    "markdown-preview": "Markdown 预览",
  };

  const setMsg = (text, error = false) => {
    const el = document.getElementById("profile-msg");
    el.className = error ? "message error" : "message";
    el.textContent = text || "";
  };

  const chips = (id, emptyId, slugs) => {
    const box = document.getElementById(id);
    const empty = document.getElementById(emptyId);
    box.replaceChildren();
    const list = (slugs || []).filter(Boolean);
    empty.hidden = list.length > 0;
    list.forEach((slug) => {
      const a = document.createElement("a");
      a.href = "../tools/" + slug + "/";
      a.textContent = names[slug] || slug;
      box.append(a);
    });
  };

  const paint = (user) => {
    const name = auth.displayName(user);
    document.getElementById("hello").textContent = name;
    document.getElementById("email-line").textContent = user.email || "";
    document.getElementById("avatar").textContent = name.slice(0, 1).toUpperCase();
    document.getElementById("name").value = user.user_metadata?.name || name;
    document.getElementById("email").value = user.email || "";
    const badge = document.getElementById("verify-badge");
    if (auth.isVerified(user)) {
      badge.className = "verify-on";
      badge.textContent = "邮箱已验证";
    } else {
      badge.className = "verify-off";
      badge.textContent = "邮箱待验证";
    }
    const meta = user.user_metadata || {};
    const localFav = window.Utilora ? Utilora.favorites() : [];
    const localRecent = window.Utilora ? Utilora.recent() : [];
    const favs = Array.from(new Set([...(meta.favorites || []), ...localFav]));
    const recents = Array.from(new Set([...(localRecent || []), ...(meta.recents || [])])).slice(0, 8);
    chips("favs", "fav-empty", favs);
    chips("recents", "recent-empty", recents);
  };

  (async () => {
    const captured = await auth.captureRedirect();
    if (captured?.error) setMsg(captured.error, true);
    if (captured?.type === "recovery") {
      location.replace("../login/?reset=1");
      return;
    }
    const session = await auth.refreshIfNeeded();
    if (!session) {
      location.href = "../login/";
      return;
    }
    paint(session.user);
    loadSecurity();
    const meta = session.user.user_metadata || {};
    if (window.Utilora) {
      const mergedFav = Array.from(new Set([...(meta.favorites || []), ...Utilora.favorites()]));
      const mergedRecent = Array.from(new Set([...Utilora.recent(), ...(meta.recents || [])])).slice(0, 8);
      localStorage.setItem("utilora_favorites", JSON.stringify(mergedFav));
      localStorage.setItem("utilora_recent", JSON.stringify(mergedRecent));
      await auth.updateUser({ data: { name: meta.name || auth.displayName(session.user), favorites: mergedFav, recents: mergedRecent } }).catch(() => {});
    }
  })();

  document.getElementById("profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    setMsg("保存中…");
    try {
      const name = document.getElementById("name").value.trim();
      const user = await auth.updateUser({ data: { name } });
      paint(user);
      setMsg("资料已更新");
    } catch (error) {
      setMsg(error.message || "保存失败", true);
    }
  });

  document.getElementById("logout").addEventListener("click", async () => {
    await auth.logout();
    location.href = "../";
  });

  const setSecurityMsg = (text, error = false) => {
    const el = document.getElementById("security-msg");
    if (!el) return;
    el.className = error ? "message error" : "message";
    el.textContent = text || "";
  };

  const paintMfa = (enabled) => {
    const status = document.getElementById("mfa-status");
    const enableBtn = document.getElementById("mfa-enable");
    const disableBtn = document.getElementById("mfa-disable");
    if (status) status.textContent = enabled ? "二次验证已开启。登录时须再填验证器中的 6 位码。" : "尚未开启二次验证。";
    if (enableBtn) enableBtn.hidden = enabled;
    if (disableBtn) disableBtn.hidden = !enabled;
  };

  const paintLocations = (rows) => {
    const box = document.getElementById("login-locations");
    if (!box) return;
    box.replaceChildren();
    if (!rows || !rows.length) {
      const empty = document.createElement("p");
      empty.className = "hint tight";
      empty.textContent = "还没有记录。下次登录后会显示最近使用的网络。";
      box.append(empty);
      return;
    }
    rows.forEach((row) => {
      const item = document.createElement("div");
      item.className = "location-item";
      const last = row.last_seen ? new Date(row.last_seen).toLocaleString("zh-CN") : "";
      item.innerHTML = "<b>" + (row.network || "未知网络") + "</b>" + (last ? "最近：" + last : "");
      box.append(item);
    });
  };

  const loadSecurity = async () => {
    if (!auth.listMfaStatus) return;
    try {
      const status = await auth.listMfaStatus();
      paintMfa(Boolean(status && status.enabled));
    } catch {
      paintMfa(false);
    }
    try {
      const rows = await auth.listLoginLocations();
      paintLocations(rows);
    } catch {
      paintLocations([]);
    }
  };

  let pendingFactorId = "";

  document.getElementById("mfa-enable")?.addEventListener("click", async () => {
    setSecurityMsg("正在生成密钥…");
    try {
      const enrolled = await auth.startMfaEnroll();
      pendingFactorId = enrolled.id;
      const totp = enrolled.totp || {};
      const qr = document.getElementById("mfa-qr");
      const secret = document.getElementById("mfa-secret");
      document.getElementById("mfa-enroll").hidden = false;
      if (totp.qr_code) {
        qr.src = totp.qr_code;
        qr.hidden = false;
      }
      secret.textContent = totp.secret ? "密钥：" + totp.secret : "";
      document.getElementById("mfa-code").value = "";
      setSecurityMsg("请用验证器扫描后填写 6 位码。");
    } catch (error) {
      setSecurityMsg(error.message || "无法开启二次验证", true);
    }
  });

  document.getElementById("mfa-cancel")?.addEventListener("click", async () => {
    if (pendingFactorId) await auth.cancelMfaEnroll(pendingFactorId).catch(() => {});
    pendingFactorId = "";
    document.getElementById("mfa-enroll").hidden = true;
    document.getElementById("mfa-qr").hidden = true;
    document.getElementById("mfa-secret").textContent = "";
    setSecurityMsg("");
  });

  document.getElementById("mfa-confirm")?.addEventListener("click", async () => {
    const code = document.getElementById("mfa-code").value.trim();
    setSecurityMsg("正在确认…");
    try {
      await auth.confirmMfaEnroll(pendingFactorId, code);
      pendingFactorId = "";
      document.getElementById("mfa-enroll").hidden = true;
      paintMfa(true);
      setSecurityMsg("二次验证已开启。");
    } catch (error) {
      setSecurityMsg(error.message || "开启失败", true);
    }
  });

  document.getElementById("mfa-disable")?.addEventListener("click", async () => {
    const code = window.prompt("关闭二次验证须填写验证器中的 6 位码");
    if (!code) return;
    setSecurityMsg("正在关闭…");
    try {
      await auth.disableMfa(code);
      paintMfa(false);
      setSecurityMsg("二次验证已关闭。");
    } catch (error) {
      setSecurityMsg(error.message || "关闭失败", true);
    }
  });

  document.getElementById("logout-others")?.addEventListener("click", async () => {
    if (!window.confirm("其他浏览器和设备会立即退出，当前这一处保持登录。继续吗？")) return;
    setSecurityMsg("正在登出其他设备…");
    try {
      await auth.logoutOthers();
      setSecurityMsg("其他设备已退出。");
    } catch (error) {
      setSecurityMsg(error.message || "操作失败", true);
    }
  });

  document.addEventListener("utilora:idle-expired", () => {
    location.href = "../login/";
  });
})();
