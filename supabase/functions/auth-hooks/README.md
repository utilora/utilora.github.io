# auth-hooks

GoTrue 密码验证与二次验证钩子。绕过登录页直接打账号接口时，仍按限额记账并锁定。

环境变量：`AUTH_HOOK_SECRET`（`v1,whsec_…`，与 Auth Hook 配置中的密钥一致）。

当前项目套餐可能无法在控制台打开 `HOOK_PASSWORD_VERIFICATION_ATTEMPT` / `HOOK_MFA_VERIFICATION_ATTEMPT`。函数已部署；打开后即可在账号服务侧生效。页面与 `login-cooldown` 仍会记账。
