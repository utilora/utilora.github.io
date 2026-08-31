# submit-purchase-intent（S-04）

提交购买意向前先校验 Cloudflare Turnstile，再调用 `submit_purchase_intent` RPC。

请求体需含 `captcha_token` 与 `email` 等字段。环境变量同 `verify-captcha`。
