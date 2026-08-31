# password-reset-limit

S-08：找回密码限流（发送重置邮件、提交新密码）。默认每邮箱每小时 3 次、每 IP 每小时 10 次。

## 部署

先执行 `supabase/migrations/202608310007_password_reset_limit.sql`，再部署本函数。

`POST /functions/v1/password-reset-limit`

- `{ "action": "check", "email": "a@b.com" }`
- `{ "action": "record", "email": "a@b.com", "kind": "send" | "submit" }`

超限返回 429，文案不包含邮箱是否存在。
