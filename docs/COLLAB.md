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
| 邀请成功奖励月数 | 3 | 被邀请人首次实际付费后，才给邀请人发放试用 |
| Edge Function 每日调用上限 | 10000 | 按 function 计 |

新增任何「每日 / 每小时 / 次数 / 天数 / 月数」限制时，必须进这张表，并在管理端提供修改入口。

## 预埋：邀请朋友（支付接通前不展示）

规则：

- 邀请一人，邀请人可获得「邀请成功奖励月数」的免费试用（默认 3 个月，管理端可改）。
- **前提**：被邀请人完成注册不算；必须被邀请人**首次实际开通付费**后才给邀请人入账。退款、未付款、仅点意向都不算。
- 防自邀、防互邀奖励、防同一被邀请人重复计奖。
- **用户端暂时不显示邀请按钮**。代码可预埋（邀请码字段、隐藏组件、feature flag），但支付未接通前不渲染、不在导航出现、不写进营销文案。
- 打开条件：管理端开关 `invite_ui_enabled`，且支付已接通。两者都满足才显示。
- 前期不做支付接入；本项只预埋数据结构与隐藏 UI，不要接 Stripe / 微信支付。

## 已完成

- [ ] 第一步 `chore/remove-side-tools`：删除全部非财税小工具，删除 `docs/PRODUCT_OPTIMIZATION.md`（合入 main 后勾选）

## 当前占用

| 线 | 分支 | 当前项 | 状态 |
|----|------|--------|------|
| 用户端 | feat/user-workspace | U-01 | 待开始 |
| 管理端 | feat/admin-ops | A-01 | 待开始 |
| 安全 | fix/security-hardening | 待合并 | S-01–S-07 已完成 |

## AI 开工前必读

1. 先读本文件，只做本线「当前项」。
2. 不要直接改 `main`。在对应长期分支上开发。
3. 不要跨线改文件。
4. `npm test` 与 `npm run build` 通过后才能把状态改为待合并。
5. 合进 `main` 后更新本文件的进度表和当前占用。
6. 前期不接支付、不开云同步、不把 service-role 写进前端。
7. 数量类限额不要硬编码。安全线做执行与校验；管理线做配置页和审计。
8. 邀请按钮支付接通前不对用户展示；不要把邀请文案写进首页。

## 用户端改善（分支 feat/user-workspace）

允许路径：`pro/`、`src/core/{banking,receivables,month-end,backup,entitlements}/`、`src/pro.ts`、`account/`、`login/`、`tools/{vat-split,income-tax,payroll,quote,number-chinese}/`、`index.html`、`policies/`、`assets/js/{auth,home,finance,pro}.js`。

U-01 未匹配流水队列：只看待处理流水；建议必须写明原因（金额相等 / 日期接近 / 摘要含客户名）；可忽略、可撤销。  
U-02 部分匹配：一笔流水分到多张未结应收，合计不得超过未收余额。  
U-03 今日待办 Dashboard：待匹配、今日该催、本周到期、备份过期。  
U-04 客户催收备忘：联系日、承诺还款日、结果（未接 / 已答应 / 已付）。  
U-05 月结纪律：未完成默认不能关；强关必须填原因并写入底稿；底稿数字与页面一致。  
U-06 备份预览：关账前提醒；导出成功才记备份时间；恢复先预览公司名和账户数量。  
U-07 账户页权益展示：方案、到期日、备份入口；去掉「一律免费」的死文案。不放邀请按钮。  
U-08 登录注册走通：验证码失败可恢复；找回密码；next 只允许站内相对路径；停用账号提示。超限文案读服务端当前配置，不写死「每天 3 次」。注册可预埋邀请码字段，但页面不推邀请。  
U-09 五个财税工具打磨：结果可复制、可打印、常见税率预设；仍免登录。  
U-10 合规页：隐私政策、用户协议、账户注销说明（不写支付条款）。  
U-11 邀请按钮预埋：账户页 / 工作台预留「邀请朋友」组件与复制邀请链接；**默认不渲染**。仅当 `invite_ui_enabled` 且支付已接通时打开。支付未接通前不要做这一项的可见 UI。

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
| U-11 | 预埋 / 不展示 | feat/user-workspace | — | — |

## 管理端改善（分支 feat/admin-ops）

允许路径：`admin/`、`supabase/admin-*.sql`、`supabase/migrations/`（权益/意向/运营/限额配置/邀请）、`src/core/purchase-intent/`、`src/core/entitlements/`。

A-01 人工开通专业版：用户详情可发放 / 收回专业版、发放 N 天试用；写入 entitlement_grants 与审计日志。N 默认读「试用天数」配置，可临时改。  
A-02 风控台：今日注册、每 IP 注册次数、验证码发送次数、一键停用。  
A-03 意向跟进：下次跟进日、结果、标记「已发试用」。  
A-04 关闭全员限免：促销可关；payment_required 保持 false。  
A-05 后台待办：新留言、待跟进意向、今日异常注册。  
A-06 敏感操作确认：提权、停用、改促销、改限额配置需二次确认并写日志。  
A-07 限额配置页：管理员可改上表全部数量（含邀请奖励月数）；校验为正整数且在合理范围；保存后立即生效；写审计。  
A-08 邀请预埋：库表记邀请人 / 被邀请人 / 状态（已绑定、待付费、已入账、无效）；管理端可查列表。`invite_ui_enabled` 默认关。入账逻辑预留勾子，**仅在接入支付 webhook 后启用**：被邀请人首次付费成功 → 按当前「邀请成功奖励月数」给邀请人发放试用。前期不接支付，不要假入账。

| 编号 | 状态 | 分支 | 最近提交 | 测试 |
|------|------|------|----------|------|
| A-01 | 待开始 | feat/admin-ops | — | — |
| A-02 | 待开始 | feat/admin-ops | — | — |
| A-03 | 待开始 | feat/admin-ops | — | — |
| A-04 | 待开始 | feat/admin-ops | — | — |
| A-05 | 待开始 | feat/admin-ops | — | — |
| A-06 | 待开始 | feat/admin-ops | — | — |
| A-07 | 待开始 | feat/admin-ops | — | — |
| A-08 | 预埋 / 待支付 | feat/admin-ops | — | — |

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
| S-01 | 已完成（待合并） | fix/security-hardening | a68c4539e6e0e3cd8fefc836ef369bfaf49a63f3 | 单元测试通过；迁移与 Edge Function 待生产部署后联调 |
| S-02 | 已完成（待合并） | fix/security-hardening | 76c6c87a601008a74f1299f6b32f2f41fb20ccca | 单元测试通过；迁移与 Edge Function 待生产部署后联调 |
| S-03 | 已完成（待合并） | fix/security-hardening | 1c656862089063d4b0b743672902c70bad4c1891 | 单元测试通过；迁移与 Edge Function 待生产部署后联调 |
| S-04 | 已完成（待合并） | fix/security-hardening | 0d9dd2bfc986c9e1eca59949b02ac7d2bfae4b12 | 单元测试通过；Edge Function 与 Turnstile 密钥待生产部署后联调 |
| S-05 | 已完成（待合并） | fix/security-hardening | cafc0283c42fe4bd1bd97bddca719b33d7ed7ccc | 单元测试通过；迁移待生产部署后联调 |
| S-06 | 已完成（待合并） | fix/security-hardening | 2cb4ae0ec1e18668c7507fa9387769b6151b1864 | 单元测试通过；迁移与 Edge Function 待生产部署后联调 |
| S-07 | 已完成（待合并） | fix/security-hardening | f01f0ee9eb98fbabef3228482ee6ad8771250a8c | 单元测试通过；迁移待生产部署后联调 |
