# A 股 AI 智能选股平台 API 设计

> REST API v1，内部研究版。基础路径 `/api/v1`，OpenAPI 为前后端契约事实源。

## 1. 设计原则

- 资源使用名词、复数路径；破坏兼容的修改发布新主版本。
- API 只读页面查询同步返回；采集、筛选、回测等长任务异步返回 `202 + job_id`。
- 所有研究结果带 `as_of`、`updated_at`、`data_source`、`quality_status`、版本和追溯 ID。
- 分页列表使用 cursor；排序字段使用 allowlist，禁止把客户端字符串拼进 SQL。
- API 不接受任意 SQL、Python、因子表达式或模型文件。
- MVP 不暴露模型概率、下单、券商或支付端点。

## 2. 通用协议

### 2.1 请求与响应

- JSON 使用 `application/json; charset=utf-8`；日期 `YYYY-MM-DD`；时间 RFC 3339 UTC。
- 请求头：`X-Request-ID` 可选，服务端缺失时生成；写操作支持 `Idempotency-Key`。
- 响应头：`X-Request-ID`、`Cache-Control`；数据页面可返回 `ETag`。
- 金额和高精度数值以 JSON 字符串输出，避免 JavaScript 浮点损失；图表用值经显式转换。

成功列表示例：

```json
{
  "data": [],
  "page": {"next_cursor": null, "has_more": false},
  "meta": {
    "as_of": "2026-10-22T15:30:00+08:00",
    "updated_at": "2026-10-22T16:05:12+08:00",
    "quality_status": "ok",
    "stale": false,
    "trace": {"data_snapshot_id": "uuid", "request_id": "uuid"}
  }
}
```

错误统一为 Problem Details 风格：

```json
{
  "type": "https://example.invalid/problems/data-not-ready",
  "title": "当日数据尚未就绪",
  "status": 409,
  "code": "DATA_NOT_READY",
  "detail": "技术指标批次仍在运行",
  "request_id": "uuid",
  "errors": []
}
```

关键状态码：400 参数、401 未认证、403 无权限、404 不存在、409 状态冲突、422 校验、429 限流、503 来源/任务不可用。

### 2.2 认证与授权

内部 MVP 可通过环境开关 `AUTH_MODE=disabled|local` 使用；非本地环境禁止 `disabled`。正式预留：15 分钟访问令牌 + HttpOnly/Secure/SameSite 刷新 Cookie，服务端旋转与撤销；浏览器写操作做 CSRF 防护。

角色：`researcher`、`operator`、`admin`。权限按 capability 校验，例如 `backtest.create`；UI 隐藏按钮不算授权。

## 3. 公开研究查询（MVP）

### 3.1 系统与数据状态

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health/live` | 进程存活，不探测外部依赖 |
| GET | `/health/ready` | DB/Redis/迁移等就绪；不公开敏感详情 |
| GET | `/system/status` | 最新交易日、数据/因子/筛选状态、演示模式 |
| GET | `/data-sources` | 可公开的数据来源、能力、有效期与状态 |
| GET | `/data-updates` | 更新任务列表，支持 status/type/date cursor |
| GET | `/data-updates/{job_id}` | 行数、耗时、质量摘要和脱敏错误 |

### 3.2 股票搜索与详情

| 方法 | 路径 | 参数/返回 |
|---|---|---|
| GET | `/instruments/search` | `q`、`exchange`、`limit<=20`；代码/中文名/拼音 |
| GET | `/instruments/{instrument_id}` | 主数据、上市状态、来源信息 |
| GET | `/instruments/{instrument_id}/bars` | `start_date`、`end_date`、`adjustment`、`limit<=2000` |
| GET | `/instruments/{instrument_id}/indicators` | `codes=ma_5,macd,rsi_14`、日期范围、factor set |
| GET | `/instruments/{instrument_id}/research-summary` | 最新规则命中、风险和数据质量；不含荐股结论 |

K 线响应必须同时返回交易日期、原始 OHLCV、选择的复权口径、来源、快照和缺失区间。范围过大返回 422，不在 API 中静默降采样。

### 3.3 选股策略与排行榜

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/strategies` | 仅 active 且允许查看的策略 |
| GET | `/strategies/{strategy_id}/versions/{version}` | 规则说明、因子、股票池、限制和免责声明 |
| GET | `/screenings/latest` | `strategy_id`，返回最近成功发布批次 |
| GET | `/screenings` | 按策略/交易日查询历史批次 |
| GET | `/screenings/{run_id}` | 批次元数据、质量状态、追溯链 |
| GET | `/screenings/{run_id}/results` | cursor、行业/交易所过滤、受限排序 |
| GET | `/screenings/{run_id}/results/{instrument_id}` | 子分、命中规则、剔除原因、所用因子 |

结果字段使用 `rule_score` 和 `research_rank`，不得使用 `buy_probability`、`recommendation` 等未经批准语义。

### 3.4 回测

| 方法 | 路径 | 权限/说明 |
|---|---|---|
| POST | `/backtests` | `backtest.create`；异步创建，需 Idempotency-Key |
| GET | `/backtests` | 当前用户可见任务列表 |
| GET | `/backtests/{id}` | 状态、参数、版本、指标、限制说明 |
| GET | `/backtests/{id}/equity` | 净值、基准、回撤序列 |
| GET | `/backtests/{id}/trades` | cursor 分页成交和成本 |
| GET | `/backtests/{id}/orders` | 含不可成交与原因 |
| GET | `/backtests/{id}/report` | 结构化报告；导出另设受限端点 |
| POST | `/backtests/{id}/cancel` | 仅 queued/running，可审计 |

创建请求只允许引用已发布策略版本和预定义参数范围：

```json
{
  "strategy_version_id": "uuid",
  "start_date": "2023-01-01",
  "end_date": "2025-12-31",
  "benchmark_instrument_id": "uuid",
  "initial_cash": "1000000.00",
  "cost_model_version": "cn_equity_v1",
  "parameters": {"top_n": 20, "rebalance": "weekly"}
}
```

响应 `202`：`{"data":{"id":"uuid","status":"queued"}}`。

## 4. 用户与自选股（预留，MVP 可关闭）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/register` | 功能开关控制；正式环境需验证与风控 |
| POST | `/auth/login` | 限流、失败审计 |
| POST | `/auth/refresh` | 刷新令牌旋转 |
| POST | `/auth/logout` | 撤销会话 |
| GET/PATCH | `/me` | 当前用户资料 |
| GET/POST | `/watchlists` | 列表/创建 |
| PATCH/DELETE | `/watchlists/{id}` | 仅所有者 |
| POST | `/watchlists/{id}/items` | 添加 instrument ID，幂等 |
| DELETE | `/watchlists/{id}/items/{instrument_id}` | 删除 |
| GET | `/me/entitlements` | 只读能力列表；MVP 无付费来源 |

不设计支付、订阅、订单、自动续费 API。

## 5. 运维与管理 API

管理 API 使用 `/admin` 前缀，必须 admin/operator 权限、审计和更严格限流：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/admin/data-updates` | 手动创建允许的数据更新任务 |
| POST | `/admin/data-updates/{id}/retry` | 按原参数幂等重试 |
| GET | `/admin/data-quality/issues` | 质量问题查询 |
| POST | `/admin/data-quality/issues/{id}/resolve` | 保存原因与操作者 |
| POST | `/admin/screenings` | 创建规则筛选任务 |
| GET | `/admin/audit-logs` | 审计查询，禁止修改 |
| PATCH | `/admin/users/{id}/status` | 启停用户，要求 reason |

策略/模型“审批”暂不开放通用 CRUD；先通过版本控制的配置和受审迁移进入系统，降低任意表达式与越权风险。

## 6. 模型 API 门禁设计

内部研究未来可启用：

- `GET /internal/model-versions`
- `GET /internal/model-versions/{id}`
- `GET /internal/predictions?decision_date=&horizon=`

这些端点仅内网 `model.read_internal` 权限。公开 `/predictions` 不在 MVP 路由表中。未来添加前必须同时满足：

1. 模型状态 `approved_public`；
2. 预测记录 `visibility=public`；
3. 全局合规 feature flag 开启；
4. 数据许可证允许展示派生结果；
5. 返回模型卡、样本外指标、校准版本、适用范围和风险提示；
6. 产品文案通过合规审查。

## 7. 追溯 API

`GET /lineage/{resource_type}/{resource_id}` 返回有权限的追溯图：结果 → 运行 → 策略/模型 → 因子集 → 数据快照 → 数据源。不得返回供应商密钥、内部存储路径或被许可证禁止的信息。

示例：

```json
{
  "data": {
    "resource": {"type": "screening_result", "id": "..."},
    "run": {"id": "...", "code_commit": "..."},
    "strategy_version": {"id": "...", "content_hash": "..."},
    "factor_set": {"id": "...", "content_hash": "..."},
    "data_snapshot": {"id": "...", "as_of": "...", "source_code": "demo_v1"}
  }
}
```

## 8. 缓存、限流和并发

- 搜索 60 次/分钟/IP；匿名行情 120 次/分钟/IP；登录 10 次/15 分钟/IP+账号；回测创建按用户并发 1–2 个。
- GET 按 URL、权限范围、数据快照组成缓存键；发布新快照主动失效。
- POST 使用 Idempotency-Key + 用户 + 路由唯一约束，重复请求返回原任务。
- K 线和结果列表设最大时间范围/行数；导出走异步任务和短期签名 URL。

## 9. OpenAPI 与测试

- 后端生成 `openapi.json`，CI 检查未审查的破坏性 diff。
- 前端客户端由 OpenAPI 自动生成，不手写重复 DTO。
- 契约测试覆盖状态码、鉴权、分页、时间格式、数值字符串、Problem Details 和模型字段门禁。
- 安全测试覆盖对象级授权、批量赋值、SQL/过滤注入、超大范围查询、登录限流和管理员审计。

## 10. MVP 页面到 API 映射

| 页面 | 主要 API |
|---|---|
| 首页仪表盘 | `/system/status`、`/screenings/latest`、`/data-updates` |
| 每日排行榜 | `/strategies`、`/screenings/{run}/results` |
| 股票详情/K 线 | `/instruments/search`、`/{id}`、`/{id}/bars` |
| 技术指标 | `/instruments/{id}/indicators`、`research-summary` |
| 历史回测 | `/backtests`、`/{id}`、`equity`、`orders`、`trades` |
| 数据状态 | `/data-sources`、`/data-updates`、`/system/status` |
