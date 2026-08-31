# registration-limit

S-01：按客户端 IP 限制每日成功注册次数。

## 部署

在 Supabase 项目中部署本 Edge Function，并先执行迁移 `202608310001_registration_ip_limit.sql`。

环境变量（平台自动注入）：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`（可选）
- `REGISTRATION_IP_SALT`（可选，用于 IP 哈希加盐）

## 接口

`POST /functions/v1/registration-limit`

- `{ "action": "check" }` — 发码/验证前检查，返回 `{ allowed, limit, used, remaining }`
- `{ "action": "record" }` — 验证成功后记账，需用户 `Authorization: Bearer <access_token>`

限额键：`platform_config.registration_success_per_ip_per_day`，默认 `3`。
