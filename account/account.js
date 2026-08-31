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
    const planBadge = document.getElementById("plan-badge");
    const planCopy = document.getElementById("plan-copy");
    if (planBadge) {
      planBadge.textContent = window.UtiloraPro ? UtiloraPro.label() : "目前免费使用";
      planBadge.className = "plan-pill on";
    }
    if (planCopy) {
      planCopy.textContent = "专业财务目前免费使用。报价单可加 logo、换模板、填收款和有效期。以后再接收费。";
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
})();
