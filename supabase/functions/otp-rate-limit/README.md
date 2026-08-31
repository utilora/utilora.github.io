# otp-rate-limit

S-02：验证码发送服务端限额（每邮箱每小时、每 IP 每小时；点发送即计）。

## 部署

先执行迁移 `202608310002_otp_rate_limit.sql`，再部署本 Edge Function。

环境变量（平台自动注入）：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REGISTRATION_IP_SALT`（可选，与 S-01 共用 IP 哈希盐）

## 接口

`POST /functions/v1/otp-rate-limit`

- `{ "action": "check", "email": "a@b.com" }` — 发码前检查
- `{ "action": "record", "email": "a@b.com" }` — 点发送时记账；超限返回 429

配置键：

- `platform_config.otp_per_email_per_hour` 默认 `3`
- `platform_config.otp_per_ip_per_hour` 默认 `10`
