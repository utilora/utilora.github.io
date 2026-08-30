# Utilora 协作看板

基准分支：main  
长期分支：`feat/user-workspace`、`feat/admin-ops`、`fix/security-hardening`  
前期不含支付、不含云同步账本。  
**数量类限额全部由管理端可改**，不要写死在前端。服务端读配置；缺省时用下表默认值。  
免费财税工具仅保留 5 个：增值税价税分离、个税测算、工资与用工成本、报价单、人民币大写。永久免费、免登录。

## 可配置限额（默认值 → 管理端可改）

| 键 | 默认 | 说明 |
|----|------|------|
| 每 IP 每天成功注册次数 | 3 | Asia/Shanghai 自然日；验证成功才计数 |
| 每邮箱每小时验证码 | 3 | 点发送即计 |
| 每 IP 每小时验证码 | 10 | 点发送即计 |
| 登录连续失败次数 | 5 | 同邮箱或同 IP |
| 登录冷却分钟 | 15 | 达到失败次数后 |
| 试用天数 | 14 | A-01 发放试用的默认天数，单次仍可手填 |
| Edge Function 每日调用上限 | 10000 | 按 function 计 |

新增任何「每日 / 每小时 / 次数 / 天数」限制时，必须进这张表，并在管理端提供修改入口。

## 已完成

- [ ] 第一步 `chore/remove-side-tools`：删除全部非财税小工具，删除 `docs/PRODUCT_OPTIMIZATION.md`（合入 main 后勾选）

## 当前占用

| 线 | 分支 | 当前项 | 状态 |
|----|------|--------|------|
| 用户端 | feat/user-workspace | U-01 | 待开始 |
| 管理端 | feat/admin-ops | A-01 | 待开始 |
| 安全 | fix/security-hardening | S-01 | 待开始 |

## AI 开工前必读

1. 先读本文件，只做本线「当前项」。
2. 不要直接改 `main`。在对应长期分支上开发。
3. 不要跨线改文件。
4. `npm test` 与 `npm run build` 通过后才能把状态改为待合并。
5. 合进 `main` 后更新本文件的进度表和当前占用。
6. 前期不接支付、不开云同步、不把 service-role 写进前端。
7. 数量类限额不要硬编码。安全线做执行与校验；管理线做配置页和审计。

## 用户端改善（分支 feat/user-workspace）

允许路径：`pro/`、`src/core/{banking,receivables,month-end,backup,entitlements}/`、`src/pro.ts`、`account/`、`login/`、`tools/{vat-split,income-tax,payroll,quote,number-chinese}/`、`index.html`、`policies/`、`assets/js/{auth,home,finance,pro}.js`。

U-01 未匹配流水队列：只看待处理流水；建议必须写明原因（金额相等 / 日期接近 / 摘要含客户名）；可忽略、可撤销。  
U-02 部分匹配：一笔流水分到多张未结应收，合计不得超过未收余额。  
U-03 今日待办 Dashboard：待匹配、今日该催、本周到期、备份过期。  
U-04 客户催收备忘：联系日、承诺还款日、结果（未接 / 已答应 / 已付）。  
U-05 月结纪律：未完成默认不能关；强关必须填原因并写入底稿；底稿数字与页面一致。  
U-06 备份预览：关账前提醒；导出成功才记备份时间；恢复先预览公司名和关键数量。  
U-07 账户页权益展示：方案、到期日、备份入口；去掉「一律免费」的死文案。  
U-08 登录注册走通：验证码失败可恢复；找回密码；next 只允许站内相对路径；停用账号提示。超限文案读服务端当前配置，不写死「每天 3 次」。  
U-09 五个财税工具打磨：结果可复制、可打印、常见税率预设；仍免登录。  
U-10 合规页：隐私政策、用户协议、账户注销说明（不写支付条款）。

| 编号 | 状态 | 分支 | 最近提交 | 测试 |
|------|------|------|----------|------|
| U-01 | 待开始 | feat/user-workspace | — | — |
| U-02 | 待开始 | feat/user-workspace | — | — |
| U-03 | 待开始 | feat/user-workspace | — | — |
| U-04 | 待开始 | feat/user-workspace | — | — |
| U-05 | 待开始 | feat/user-workspace | — | — |
| U-06 | 待开始 | feat/user-workspace | — | — |
| U-07 | 待开始 | feat/user-workspace | — | — |
| U-08 | 待开始 | feat/user-workspace | — | — |
| U-09 | 待开始 | feat/user-workspace | — | — |
| U-10 | 待开始 | feat/user-workspace | — | — |

## 管理端改善（分支 feat/admin-ops）

允许路径：`admin/`、`supabase/admin-*.sql`、`supabase/migrations/`（权益/意向/运营/限额配置）、`src/core/purchase-intent/`、`src/core/entitlements/`。

A-01 人工开通专业版：用户详情可发放 / 收回专业版、发放 N 天试用；写入 entitlement_grants 与审计日志。N 默认读「试用天数」配置，可临时改。  
A-02 风控台：今日注册、每 IP 注册次数、验证码发送次数、一键停用。  
A-03 意向跟进：下次跟进日、结果、标记「已发试用」。  
A-04 关闭全员限免：促销可关；payment_required 保持 false。  
A-05 后台待办：新留言、待跟进意向、今日异常注册。  
A-06 敏感操作确认：提权、停用、改促销、改限额配置需二次确认并写日志。  
A-07 限额配置页：管理员可改上表全部数量；校验为正整数且在合理范围；保存后立即生效；写审计（谁改了什么、旧值、新值）。安全线 S-01–S-03、S-06 必须读这份配置，不得只读代码里的默认数字。

| 编号 | 状态 | 分支 | 最近提交 | 测试 |
|------|------|------|----------|------|
| A-01 | 待开始 | feat/admin-ops | — | — |
| A-02 | 待开始 | feat/admin-ops | — | — |
| A-03 | 待开始 | feat/admin-ops | — | — |
| A-04 | 待开始 | feat/admin-ops | — | — |
| A-05 | 待开始 | feat/admin-ops | — | — |
| A-06 | 待开始 | feat/admin-ops | — | — |
| A-07 | 待开始 | feat/admin-ops | — | — |

## 安全改善（分支 fix/security-hardening）

允许路径：`supabase/functions/`、`supabase/migrations/`（限流/验证码/RLS）、`assets/js/auth.js`、`login/`、`feedback/`。

S-01 每 IP 每天成功注册不超过配置值（默认 3；验证成功才计数，不是点发送就计数）。  
S-02 验证码服务端限额：读配置（默认每邮箱每小时 3 封；每 IP 每小时 10 封）。  
S-03 登录失败冷却：读配置（默认连续 5 次失败，冷却 15 分钟）。  
S-04 注册 / 留言 / 购买意向加人机验证，服务端验票。  
S-05 审计 RLS 与 admin RPC：anon key 不能拖用户或分析表。  
S-06 Edge Function 鉴权、超时、日调用上限读配置；前端不得出现 service-role。  
S-07 停用账号后 refresh 立即失效。

| 编号 | 状态 | 分支 | 最近提交 | 测试 |
|------|------|------|----------|------|
| S-01 | 待开始 | fix/security-hardening | — | — |
| S-02 | 待开始 | fix/security-hardening | — | — |
| S-03 | 待开始 | fix/security-hardening | — | — |
| S-04 | 待开始 | fix/security-hardening | — | — |
| S-05 | 待开始 | fix/security-hardening | — | — |
| S-06 | 待开始 | fix/security-hardening | — | — |
| S-07 | 待开始 | fix/security-hardening | — | — |
