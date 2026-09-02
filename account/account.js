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

  const paintAvatar = (name, avatarUrl) => {
    const initial = document.getElementById("avatar");
    const img = document.getElementById("avatar-img");
    const removeBtn = document.getElementById("avatar-remove");
    const letter = (name || "U").slice(0, 1).toUpperCase();
    if (initial) initial.textContent = letter;
    if (avatarUrl && img) {
      img.src = avatarUrl;
      img.alt = letter + " 的头像";
      img.hidden = false;
      if (initial) initial.hidden = true;
      if (removeBtn) removeBtn.hidden = false;
    } else {
      if (img) {
        img.removeAttribute("src");
        img.hidden = true;
      }
      if (initial) initial.hidden = false;
      if (removeBtn) removeBtn.hidden = true;
    }
  };

  const paintProfileFields = (profile) => {
    if (!profile) return;
    const setVal = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value || "";
    };
    if (profile.display_name) setVal("name", profile.display_name);
    setVal("company", profile.company);
    setVal("title", profile.title);
    setVal("city", profile.city);
    setVal("bio", profile.bio);
    updateBioCount();
  };

  const updateBioCount = () => {
    const bio = document.getElementById("bio");
    const count = document.getElementById("bio-count");
    if (count) count.textContent = String((bio && bio.value || "").length) + " / 160";
  };

  const paint = (user, profile) => {
    const name = (profile && profile.display_name) || auth.displayName(user);
    document.getElementById("hello").textContent = name;
    document.getElementById("email-line").textContent = user.email || "";
    document.getElementById("name").value = (profile && profile.display_name) || user.user_metadata?.name || name;
    document.getElementById("email").value = user.email || "";
    paintAvatar(name, profile && profile.avatar_url);
    paintProfileFields(profile);
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
    const favs = Array.from(new Set([...(meta.favorites || []), ...localFav]));
    chips("favs", "fav-empty", favs);
  };

  let currentProfile = null;

  const toSquareJpeg = (file) => new Promise((resolve, reject) => {
    if (!file || !/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
      reject(new Error("请选择 JPG、PNG 或 WebP 图片。"));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error("图片请小于 2 MB。"));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      if (side < 32) {
        URL.revokeObjectURL(url);
        reject(new Error("图片太小，请换一张更清晰的。"));
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      let quality = 0.82;
      let data = canvas.toDataURL("image/jpeg", quality);
      while (data.length > 80000 && quality > 0.45) {
        quality -= 0.12;
        data = canvas.toDataURL("image/jpeg", quality);
      }
      if (data.length > 80000) {
        reject(new Error("图片处理后仍太大，请换一张简单一些的。"));
        return;
      }
      resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取这张图片。"));
    };
    img.src = url;
  });

  const readFormProfile = () => ({
    display_name: document.getElementById("name").value.trim(),
    company: document.getElementById("company").value.trim(),
    title: document.getElementById("title").value.trim(),
    city: document.getElementById("city").value.trim(),
    bio: document.getElementById("bio").value.trim(),
    avatar_url: currentProfile && currentProfile.avatar_url || null,
  });

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
    paint(session.user, null);
    loadSecurity();
    const meta = session.user.user_metadata || {};
    if (window.Utilora) {
      const mergedFav = Array.from(new Set([...(meta.favorites || []), ...Utilora.favorites()]));
      localStorage.setItem("utilora_favorites", JSON.stringify(mergedFav));
      await auth.updateUser({ data: { name: meta.name || auth.displayName(session.user), favorites: mergedFav } }).catch(() => {});
    }
    try {
      currentProfile = auth.getMyProfile ? await auth.getMyProfile() : null;
      paint(session.user, currentProfile);
    } catch {
      currentProfile = null;
    }
  })();

  document.getElementById("bio")?.addEventListener("input", updateBioCount);

  document.getElementById("avatar-file")?.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    setMsg("正在处理头像…");
    try {
      const dataUrl = await toSquareJpeg(file);
      const session = auth.readSession && auth.readSession();
      const fields = { ...readFormProfile(), avatar_url: dataUrl };
      currentProfile = await auth.saveMyProfile(fields, true);
      paint(session && session.user || {}, currentProfile);
      setMsg("头像已更新");
    } catch (error) {
      setMsg(error.message || "头像更新失败", true);
    }
  });

  document.getElementById("avatar-remove")?.addEventListener("click", async () => {
    setMsg("正在移除头像…");
    try {
      const session = auth.readSession && auth.readSession();
      const fields = { ...readFormProfile(), avatar_url: null };
      currentProfile = await auth.saveMyProfile(fields, true);
      paint(session && session.user || {}, currentProfile);
      setMsg("头像已移除");
    } catch (error) {
      setMsg(error.message || "移除失败", true);
    }
  });

  document.getElementById("profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    setMsg("保存中…");
    try {
      const name = document.getElementById("name").value.trim();
      const fields = readFormProfile();
      currentProfile = await auth.saveMyProfile(fields, false);
      const user = await auth.updateUser({ data: { name } });
      paint(user, currentProfile);
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

  const paintMfa = (enabled, remaining) => {
    const status = document.getElementById("mfa-status");
    const enableBtn = document.getElementById("mfa-enable");
    const disableBtn = document.getElementById("mfa-disable");
    const rotateBtn = document.getElementById("recovery-rotate");
    const recoveryStatus = document.getElementById("recovery-status");
    if (status) status.textContent = enabled ? "二次验证已开启。登录时须再填验证器中的 6 位码。" : "尚未开启二次验证。";
    if (enableBtn) enableBtn.hidden = enabled;
    if (disableBtn) disableBtn.hidden = !enabled;
    if (rotateBtn) rotateBtn.hidden = !enabled;
    if (recoveryStatus) {
      recoveryStatus.textContent = enabled
        ? (remaining > 0 ? "还剩 " + remaining + " 张未使用的恢复码。明文只在生成时显示一次。" : "还没有可用恢复码。请立刻重新生成并保存。")
        : "";
    }
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
      const net = document.createElement("b");
      net.textContent = row.network || "未知网络";
      item.append(net);
      if (last) item.append(document.createTextNode("最近：" + last));
      box.append(item);
    });
  };

  const shortAgent = (raw) => {
    const text = String(raw || "");
    if (!text) return "未知设备";
    if (/iPhone|iPad/i.test(text)) return "Apple 设备";
    if (/Android/i.test(text)) return "Android 设备";
    if (/Macintosh/i.test(text)) return "Mac";
    if (/Windows/i.test(text)) return "Windows";
    if (/Linux/i.test(text)) return "Linux";
    return text.slice(0, 48);
  };

  const paintSessions = (rows) => {
    const box = document.getElementById("login-sessions");
    if (!box) return;
    box.replaceChildren();
    if (!rows || !rows.length) {
      const empty = document.createElement("p");
      empty.className = "hint tight";
      empty.textContent = "目前只能看到当前这一处。";
      box.append(empty);
      return;
    }
    rows.forEach((row) => {
      const item = document.createElement("div");
      item.className = row.current ? "session-item current" : "session-item";
      const title = document.createElement("b");
      title.textContent = (row.current ? "当前 · " : "") + shortAgent(row.user_agent);
      item.append(title);
      const last = row.last_active ? new Date(row.last_active).toLocaleString("zh-CN") : "";
      const created = row.created_at ? new Date(row.created_at).toLocaleString("zh-CN") : "";
      item.append(document.createTextNode((last ? "最近活动：" + last : "") + (created ? "　登录于：" + created : "")));
      box.append(item);
    });
  };

  const showRecoveryCodes = (codes) => {
    const box = document.getElementById("recovery-once");
    const list = document.getElementById("recovery-list");
    if (!box || !list) return;
    list.replaceChildren();
    (codes || []).forEach((code) => {
      const li = document.createElement("li");
      li.textContent = code;
      list.append(li);
    });
    box.hidden = !codes || !codes.length;
    window.__utiloraRecoveryCodes = codes || [];
  };

  const loadSecurity = async () => {
    if (!auth.listMfaStatus) return;
    try {
      const status = await auth.listMfaStatus();
      paintMfa(Boolean(status && status.enabled), Number(status && status.remaining) || 0);
    } catch {
      paintMfa(false, 0);
    }
    try {
      const rows = await auth.listLoginLocations();
      paintLocations(rows);
    } catch {
      paintLocations([]);
    }
    try {
      const sessions = auth.listMySessions ? await auth.listMySessions() : [];
      paintSessions(sessions);
    } catch {
      paintSessions([]);
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
      const enrolled = await auth.confirmMfaEnroll(pendingFactorId, code);
      pendingFactorId = "";
      document.getElementById("mfa-enroll").hidden = true;
      paintMfa(true, (enrolled && enrolled.recovery_codes || []).length);
      showRecoveryCodes(enrolled && enrolled.recovery_codes);
      setSecurityMsg(enrolled && enrolled.recovery_codes && enrolled.recovery_codes.length
        ? "二次验证已开启。请保存下面的恢复码，只显示这一次。"
        : "二次验证已开启，但恢复码未能生成。请点「重新生成恢复码」。");
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
      paintMfa(false, 0);
      showRecoveryCodes([]);
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
      try { paintSessions(await auth.listMySessions()); } catch { /* ignore */ }
    } catch (error) {
      setSecurityMsg(error.message || "操作失败", true);
    }
  });

  document.getElementById("recovery-rotate")?.addEventListener("click", async () => {
    const code = window.prompt("重新生成恢复码须填写验证器中的 6 位码。旧恢复码会立即失效。");
    if (!code) return;
    setSecurityMsg("正在生成新的恢复码…");
    try {
      const codes = await auth.rotateRecoveryCodes(code);
      paintMfa(true, codes.length);
      showRecoveryCodes(codes);
      setSecurityMsg("新的恢复码已生成，请立刻保存。旧码已失效。");
    } catch (error) {
      setSecurityMsg(error.message || "生成失败", true);
    }
  });

  document.getElementById("recovery-copy")?.addEventListener("click", async () => {
    const codes = window.__utiloraRecoveryCodes || [];
    if (!codes.length) return;
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setSecurityMsg("已复制到剪贴板。");
    } catch {
      setSecurityMsg("复制失败，请手动抄写。", true);
    }
  });

  document.getElementById("recovery-download")?.addEventListener("click", () => {
    const codes = window.__utiloraRecoveryCodes || [];
    if (!codes.length) return;
    const blob = new Blob(["Utilora 二次验证恢复码\n每张只能用一次。请离线保存。\n\n" + codes.join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "utilora-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.addEventListener("utilora:idle-expired", () => {
    location.href = "../login/";
  });
})();
