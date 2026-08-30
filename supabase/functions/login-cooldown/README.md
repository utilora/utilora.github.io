# login-cooldown

S-03：登录失败冷却（同邮箱或同 IP 连续失败达配置次数后进入冷却期）。

## 部署

在 Supabase 项目中部署本 Edge Function，并先执行迁移 `202608310003_login_failure_cooldown.sql`。

环境变量（平台自动注入）：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REGISTRATION_IP_SALT`（可选，用于 IP 哈希加盐）

## 接口

`POST /functions/v1/login-cooldown`

- `{ "action": "check", "email": "..." }` — 登录前检查，返回 `{ allowed, remaining_minutes, ... }`
- `{ "action": "record_failure", "email": "..." }` — 密码错误后记账；达上限返回 429
- `{ "action": "clear_success", "email": "..." }` — 登录成功后清零失败计数

配置键：

- `platform_config.login_failure_max_attempts`，默认 `5`
- `platform_config.login_cooldown_minutes`，默认 `15`
