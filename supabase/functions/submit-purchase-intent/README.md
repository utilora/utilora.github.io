# submit-purchase-intent（S-04 / S-09）

购买意向只走本函数。前端不得再直接调用 `submit_purchase_intent` RPC。

流程：校验 Cloudflare Turnstile（密钥缺失则拒绝）→ 按邮箱 / IP 小时限额记账 → 以服务端身份写入意向。

请求体需含 `captcha_token` 与 `email`。

配置键：

- `platform_config.purchase_intent_per_email_per_hour` 默认 `3`
- `platform_config.purchase_intent_per_ip_per_hour` 默认 `10`

超限返回 429，文案不写死次数。需先执行 `202608310013_feedback_intent_submit_limit.sql` 与 `202608310016_submit_path_lockdown.sql`。
