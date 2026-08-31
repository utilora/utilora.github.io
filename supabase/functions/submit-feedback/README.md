# submit-feedback

S-09：功能建议提交。必须登录；服务端验人机验证；每用户 / 每 IP 小时限额读配置。

## 部署

先执行 `supabase/migrations/202608310013_feedback_intent_submit_limit.sql`，再部署本函数。

`POST /functions/v1/submit-feedback`

请求头携带用户 `Authorization: Bearer <access_token>`。

```json
{
  "captcha_token": "...",
  "name": "称呼",
  "title": "想增加的功能",
  "message": "说明",
  "contact": "选填"
}
```

超限返回 429，文案不写死次数。

配置键：

- `platform_config.feedback_per_user_per_hour` 默认 `5`
- `platform_config.feedback_per_ip_per_hour` 默认 `10`
