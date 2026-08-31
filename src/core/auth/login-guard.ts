/** U-08: 登录后回跳只允许站内相对路径。 */
export const safeNextPath = (raw: unknown, fallback = "../account/"): string => {
  if (raw == null) return fallback;
  let value = String(raw).trim();
  if (!value) return fallback;
  try {
    value = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  value = value.trim();
  if (!value || value.length > 180) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return fallback;
  if (value.startsWith("//") || value.includes("://") || value.includes("\\")) return fallback;
  if (/[\s<>'"`]/.test(value) || value.includes("@")) return fallback;
  if (!/^(?:\.\.\/|\.\/|\/)/.test(value) || /^\/\//.test(value)) return fallback;
  return value;
};

export const registrationLimitMessage = (data: { message?: string | null; limit?: number } | null | undefined): string => {
  if (data?.message) return String(data.message);
  const limit = Number(data?.limit);
  if (Number.isInteger(limit) && limit > 0) {
    return `今日该网络注册次数已达上限（当前每 IP 每天 ${limit} 次），请明日再试或更换网络。`;
  }
  return "今日该网络注册次数已达上限，请明日再试或更换网络。";
};

export const otpLimitMessage = (data: {
  message?: string | null;
  reason?: string | null;
  email_limit?: number;
  ip_limit?: number;
} | null | undefined): string => {
  if (data?.message) return String(data.message);
  if (data?.reason === "ip_limit") {
    const limit = Number(data.ip_limit);
    if (Number.isInteger(limit) && limit > 0) {
      return `当前网络发送验证码次数已达上限（每小时 ${limit} 次），请稍后再试或更换网络。`;
    }
    return "当前网络发送验证码次数已达上限，请稍后再试或更换网络。";
  }
  const limit = Number(data?.email_limit);
  if (Number.isInteger(limit) && limit > 0) {
    return `该邮箱发送验证码次数已达上限（每小时 ${limit} 次），请稍后再试。`;
  }
  return "验证码发送次数已达上限，请稍后再试。";
};

export const loginCooldownMessage = (data: {
  message?: string | null;
  remaining_minutes?: number;
  cooldown_minutes?: number;
} | null | undefined): string => {
  if (data?.message) return String(data.message);
  const mins = Number(data?.remaining_minutes || data?.cooldown_minutes);
  if (Number.isInteger(mins) && mins > 0) {
    return `登录失败次数过多，请约 ${mins} 分钟后再试。`;
  }
  return "登录失败次数过多，请稍后再试。";
};

export const parseInviteCode = (search: string): string => {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = (params.get("invite") || params.get("code") || "").trim();
  if (!raw || raw.length > 32) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return "";
  return raw;
};

export const DISABLED_ACCOUNT_MESSAGE = "该账号已停用，请联系管理员。";
