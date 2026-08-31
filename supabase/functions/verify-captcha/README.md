# verify-captcha（S-04）

Cloudflare Turnstile 服务端验票。注册发码、留言、购买意向在提交前调用本函数。

## 环境变量

- `TURNSTILE_SECRET_KEY`：Turnstile 密钥（仅服务端）。未配置时返回 `skipped: true`，便于本地；生产必须配置。
- 前端使用公开 Site Key（页面 meta `turnstile-site-key` 或 `window.__TURNSTILE_SITE_KEY`），禁止写入 secret。

## 调用

```json
POST /functions/v1/verify-captcha
{
  "action": "verify",
  "token": "<turnstile-response>",
  "purpose": "register" | "feedback" | "purchase_intent"
}
```

成功：`{ "allowed": true }`。失败：`400/403` 与 `captcha_required` / `captcha_failed`。
