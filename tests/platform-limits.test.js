/**
 * A-07 纯逻辑单元测试：限额校验（整数、范围、账龄桶序）
 * 运行：node tests/platform-limits.test.js
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const FIELDS = [
  { key: "registration_success_per_ip_per_day", min: 1, max: 100, label: "每 IP 每天成功注册次数" },
  { key: "otp_per_email_per_hour", min: 1, max: 50, label: "每邮箱每小时验证码" },
  { key: "otp_per_ip_per_hour", min: 1, max: 200, label: "每 IP 每小时验证码" },
  { key: "login_failure_max_attempts", min: 1, max: 30, label: "登录连续失败次数" },
  { key: "login_cooldown_minutes", min: 1, max: 1440, label: "登录冷却分钟" },
  { key: "password_reset_per_email_per_hour", min: 1, max: 50, label: "每邮箱每小时找回密码" },
  { key: "password_reset_per_ip_per_hour", min: 1, max: 200, label: "每 IP 每小时找回密码" },
  { key: "edge_function_daily_call_limit", min: 1, max: 1000000, label: "Edge Function 每日调用上限" },
  { key: "trial_days", min: 1, max: 365, label: "试用天数" },
  { key: "invite_reward_months", min: 1, max: 24, label: "邀请成功奖励月数" },
  { key: "match_date_near_days", min: 0, max: 30, label: "匹配日期接近天数" },
  { key: "match_amount_tolerance_cents", min: 0, max: 100, label: "匹配金额容差（分）" },
  { key: "backup_stale_days", min: 1, max: 90, label: "备份过期天数" },
  { key: "aging_bucket_1_days", min: 1, max: 365, label: "账龄桶1上限天" },
  { key: "aging_bucket_2_days", min: 1, max: 365, label: "账龄桶2上限天" },
  { key: "aging_bucket_3_days", min: 1, max: 365, label: "账龄桶3上限天" },
];

function parseLimitValue(field, raw) {
  const text = String(raw ?? "").trim();
  if (!text || !/^-?\d+$/.test(text)) return { ok: false, error: `${field.label} 须为整数` };
  const value = Number(text);
  if (!Number.isInteger(value) || value < field.min || value > field.max) {
    return { ok: false, error: `${field.label} 须为 ${field.min}–${field.max} 的整数` };
  }
  return { ok: true, value };
}

function validateLimits(values) {
  const next = {};
  for (const field of FIELDS) {
    const parsed = parseLimitValue(field, values[field.key]);
    if (!parsed.ok) return parsed;
    next[field.key] = parsed.value;
  }
  const b1 = next.aging_bucket_1_days;
  const b2 = next.aging_bucket_2_days;
  const b3 = next.aging_bucket_3_days;
  if (!(b1 > 0 && b1 < b2 && b2 < b3 && b3 <= 365)) {
    return { ok: false, error: "账龄分桶须满足 0 < 桶1 < 桶2 < 桶3 ≤ 365" };
  }
  return { ok: true, values: next };
}

const defaults = {
  registration_success_per_ip_per_day: 3,
  otp_per_email_per_hour: 3,
  otp_per_ip_per_hour: 10,
  login_failure_max_attempts: 5,
  login_cooldown_minutes: 15,
  password_reset_per_email_per_hour: 3,
  password_reset_per_ip_per_hour: 10,
  edge_function_daily_call_limit: 10000,
  trial_days: 14,
  invite_reward_months: 3,
  match_date_near_days: 3,
  match_amount_tolerance_cents: 0,
  backup_stale_days: 7,
  aging_bucket_1_days: 30,
  aging_bucket_2_days: 60,
  aging_bucket_3_days: 90,
};

assert(FIELDS.length === 16, "all configurable limits present");
assert(validateLimits(defaults).ok === true, "defaults valid");
assert(validateLimits({ ...defaults, invite_reward_months: 6 }).ok === true, "invite months ok");
assert(validateLimits({ ...defaults, match_amount_tolerance_cents: 0 }).ok === true, "zero fen ok");
assert(validateLimits({ ...defaults, trial_days: 0 }).ok === false, "trial 0 rejected");
assert(validateLimits({ ...defaults, trial_days: "14.5" }).ok === false, "float rejected");
assert(validateLimits({ ...defaults, aging_bucket_1_days: 90, aging_bucket_2_days: 60, aging_bucket_3_days: 30 }).ok === false, "bucket order rejected");
assert(validateLimits({ ...defaults, login_failure_max_attempts: 99 }).ok === false, "over max rejected");

const msg = validateLimits({ ...defaults, login_failure_max_attempts: 99 });
assert(msg.ok === false && /登录连续失败/.test(msg.error), "range message uses label");

console.log("platform-limits.test.js: ok");
