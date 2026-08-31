# submit-purchase-intent（S-04 / S-09）

提交购买意向前先校验 Cloudflare Turnstile，再按邮箱 / IP 小时限额记账，最后调用 `submit_purchase_intent` RPC。

请求体需含 `captcha_token` 与 `email` 等字段。环境变量同 `verify-captcha`。

配置键：

- `platform_config.purchase_intent_per_email_per_hour` 默认 `3`
- `platform_config.purchase_intent_per_ip_per_hour` 默认 `10`

超限返回 429，文案不写死次数。需先执行 `202608310013_feedback_intent_submit_limit.sql`。
