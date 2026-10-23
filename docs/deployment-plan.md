# A 股 AI 智能选股平台云端开发与部署方案

> 设计日期：2026-10-23。价格仅为规划级估算，创建资源前必须用官方计算器按区域复核并由用户确认。本文不授权创建任何付费资源或公开服务。

## 1. 四类环境必须分开

| 层次 | 用途 | 数据 | 对外性 |
|---|---|---|---|
| GitHub 仓库 | 代码、文档、Issue、PR、CI | 不存行情库、模型大文件和 secret | 私有优先 |
| Codespaces | 可重复云端开发 | 合成 demo 数据，临时 DB | 仅开发者 |
| 测试环境 | 集成/E2E/内部验收 | 合成或获准测试数据 | 私网/身份保护 |
| 生产环境 | 未来公众网站 | 仅获商业授权数据 | 合规审批后公开 |

当前本地仓库远程是 `https://github.com/utilora/utilora.github.io.git`，分支为 `main`，并存在未提交改动。它不是已确认的 A 股平台仓库。不得向该远程推送新平台实现；下一阶段应由用户决定新建仓库或提供正确仓库。

## 2. GitHub 工作流

- 新项目建议私有仓库，`main` 保护：PR 合并、至少 1 人审查、CI 必须通过、禁止 force-push。
- 功能分支使用 `codex/...`；不直接在 `main` 开发或合并。
- GitHub Environments：`test`、`production` 分离 secret；production 要人工审批。
- Actions 最小 `permissions: contents: read`，按 job 增权；第三方 Action 固定完整 commit SHA。
- 仓库只存迁移、代码和 demo fixture；真实行情快照、数据库 dump、模型二进制走受控存储。
- 启用 secret scanning、Dependabot、CODEOWNERS、PR 模板和分支规则。

## 3. Devcontainer 设计

建议 `.devcontainer/devcontainer.json`：

```json
{
  "name": "ashare-ai-platform",
  "dockerComposeFile": ["../compose.yaml", "compose.codespaces.yaml"],
  "service": "dev",
  "workspaceFolder": "/workspaces/ashare-ai-platform",
  "forwardPorts": [5173, 8000],
  "portsAttributes": {
    "5173": {"label": "Web", "onAutoForward": "notify"},
    "8000": {"label": "API", "onAutoForward": "notify"}
  },
  "postCreateCommand": "./scripts/bootstrap-dev.sh",
  "remoteUser": "vscode",
  "containerEnv": {"APP_ENV": "development", "DEMO_MODE": "true"},
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-python.python",
        "charliermarsh.ruff",
        "ms-python.mypy-type-checker",
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode"
      ]
    }
  }
}
```

实际落地时锁定基础镜像 digest、Node/Python 版本。`postCreateCommand` 必须幂等，不下载未审查脚本，不自动获取真实数据。Codespace 默认 2 核，停止空闲实例并设消费上限。GitHub 官方说明个人账户含一定免费 compute/storage，超额需配置计费；具体额度按账号计划查看，不能假定永久免费。

## 4. Docker Compose 设计

开发 Compose 服务：

- `dev`：开发工具容器，挂载源码。
- `web`：Vite dev server；生产由静态站或 Nginx 提供。
- `api`：FastAPI/Uvicorn，不在生产使用 `--reload`。
- `worker`：Celery worker。
- `scheduler`：Celery beat；开发默认可停用。
- `postgres`：持久卷、健康检查、非默认密码。
- `redis`：持久化不是正确性依赖，限制内存与淘汰策略。

使用 `profiles` 区分 `dev`、`test`、`ops`；测试使用临时卷和独立数据库。生产不直接复用开发 Compose 暴露数据库端口，不在镜像中打包 `.env`。

健康依赖只用于启动便利，应用仍要处理依赖暂不可用。迁移作为一次性 release job 执行，不能由每个 API 实例并发自动迁移。

## 5. 环境变量与密钥

`.env.example` 只含占位项和安全默认值：

```dotenv
APP_ENV=development
DEMO_MODE=true
LOG_LEVEL=INFO
API_BASE_URL=http://localhost:8000
WEB_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql+psycopg://app:change-me@postgres:5432/ashare
REDIS_URL=redis://redis:6379/0
AUTH_MODE=local
JWT_SIGNING_KEY_REF=
MARKET_DATA_PROVIDER=demo
MARKET_DATA_SECRET_REF=
MODEL_PUBLIC_VISIBILITY=false
SENTRY_DSN=
```

规则：

- 开发者用 Codespaces Secrets 或本机未跟踪 `.env`；测试/生产用云 Secret Manager。
- 变量只保存 secret 引用更佳；绝不使用 `VITE_` 前缀暴露服务端密钥。
- 测试/生产使用不同账号、数据库、对象桶、密钥和域名；禁止共享主凭据。
- secret 轮换、读取和部署均写审计；日志启动时只显示配置项是否存在，不显示值。

## 6. GitHub Actions

### PR CI `ci.yml`

1. checkout（固定 SHA）并启用最小权限。
2. Python：`ruff check/format --check`、mypy、pytest unit/contract。
3. Node：pnpm frozen lockfile、ESLint、TypeScript、Vitest、Vite build。
4. PostgreSQL/Redis service container：Alembic upgrade、integration tests。
5. OpenAPI 生成与 diff；数据库单一 migration head。
6. dependency/secret/license scan；Docker build，不推送。

按路径过滤前后端 job，但主分支定期跑完整矩阵。缓存键包含锁文件哈希，不缓存 secret 和真实数据。

### 定时任务 `scheduled-research.yml`

MVP 初始禁用真实数据。未来启用时：交易日收盘后延迟运行；使用 GitHub Environment secret；`concurrency` 防重入；任务调用受保护的后台入口或运行一次性容器；保留脱敏摘要，不上传授权数据。GitHub Actions 不是生产级任务调度事实源，连续可靠性要求提高后迁移到云调度器。

### 镜像与部署

- 合并 main 后构建不可变镜像，标签含 commit SHA，生成 SBOM 并扫描。
- 只推至私有 registry；测试部署可自动，生产部署必须人工审批。
- 数据库迁移 → 健康检查 → 滚动发布 → smoke test；失败回滚应用镜像。数据库破坏性迁移使用 expand/contract，不依赖简单 down migration。

## 7. 部署选项比较

### 选项 A：Render（最快内部测试）

静态 Web + FastAPI Web Service + Worker + Managed PostgreSQL + Redis-compatible Key Value。优点是配置少、预览容易；缺点是跨境访问、区域、休眠/免费层限制、成本随多个服务叠加，且真实 A 股数据授权可能限制区域。适合 demo/内部测试，不作为中国大陆正式站默认结论。

### 选项 B：AWS Lightsail（低运维原型）

容器/实例 + Managed PostgreSQL + 对象存储；Redis 可先同机容器用于测试。官方 2026-10 价格页示例中容器从约 USD 7/月起，托管数据库常见入门约 USD 15/月，负载均衡约 USD 18/月；2 GB Linux 实例约 USD 22/月。完整小型组合通常 USD 40–100/月，未含 Redis 托管、备份增长、域名和流量超额。适合海外/内部环境。

### 选项 C：中国大陆云（未来公众站候选）

腾讯云/阿里云的 CVM/容器 + 托管 PostgreSQL + Redis + 对象存储/CDN。优点是大陆访问与本地支持；缺点是 ICP 备案、实名认证、网络与数据合规流程，以及不同地域价格差异。正式公众站若面向大陆用户，应在数据和证券合规确认后优先评估此路线，使用官方价格计算器报价。

### 选项 D：单台 VPS Compose（最低成本测试）

4 vCPU/8 GB、100 GB SSD 可承载小规模 Web/API/Worker/Postgres/Redis。优点是便宜直接；缺点是数据库、备份、升级、故障恢复和安全全部自管，单点故障明显。只适合内部测试，不适合未经增强的公众生产。

## 8. 推荐分阶段拓扑与资源

### 云端开发

- Codespaces 2–4 vCPU、8 GB RAM、约 32 GB 工作存储。
- PostgreSQL/Redis 使用 Compose；只载入小型 demo 数据。
- 成本：优先使用账号包含额度；超额前设置 USD 0 或明确月度上限提醒。官方计费按机型 compute 小时和 storage 计算。

### 内部测试（低使用量）

- API + Worker：2–4 vCPU、4–8 GB RAM。
- PostgreSQL：2 vCPU、4 GB RAM、50–100 GB SSD，自动备份。
- Redis：0.5–1 GB。
- 对象存储：10–50 GB；前端静态托管。
- 规划预算：自管 VPS 约 USD 25–80/月；托管组件组合约 USD 60–180/月。价格不含商业行情和 LLM。

### 未来小规模生产

- Web/CDN；API 至少 2 实例（各 2 vCPU/4 GB）；Worker 4–8 vCPU/8–16 GB。
- 托管 PostgreSQL 高可用 4 vCPU/16 GB 起，200+ GB SSD/PITR；托管 Redis 1–4 GB。
- 对象存储、WAF、监控、日志和备份跨区。
- 规划预算：约 USD 300–1,200+/月，主要取决于 HA、区域、保留期、流量和训练资源；商业行情费用可能远高于基础设施。

模型训练不设常驻 GPU。LightGBM 首先使用按需 8–16 vCPU、32–64 GB RAM CPU 任务，运行结束释放。真实全市场历史量和特征规模需基准测试后定容。

## 9. 数据安全与运维要求

- 网络：DB/Redis 无公网入口；服务间私网；管理入口 MFA/VPN/SSO；TLS 全程。
- 身份：每服务独立账号；数据库读写、迁移、只读分析权限分离。
- 数据：磁盘/备份/对象加密；授权数据按合同隔离和删除；开发环境不得复制生产数据。
- 备份：测试每日、生产 PITR + 每日快照；定义内部测试 RPO 24h/RTO 8h，生产目标另行审批。
- 监控：HTTP、队列、任务延迟、DB、缓存、数据新鲜度、异常率和成本告警。
- 应急：数据源异常停止发布；可切回最近成功快照；密钥泄漏立即轮换并审计。

## 10. 部署步骤与人工确认

1. **人工确认**新 GitHub 仓库、组织、私有性和预算所有者。
2. 建立分支保护、Environments、secret 和消费限额。
3. CI 构建并验证不可变镜像；测试环境只使用 demo 数据。
4. **人工确认**云厂商、区域、预计月费和是否会产生付费。
5. 创建测试资源、执行迁移、载入 demo、运行 smoke/E2E 与恢复演练。
6. **人工确认**每个真实数据源的授权用途后才接入真实数据。
7. 公开生产前完成渗透/安全、隐私、数据许可、ICP（如适用）和证券业务合规评审。
8. **人工确认**生产发布和域名公开；默认保持私有。

## 11. 官方价格参考

- [GitHub Codespaces billing](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces)
- [GitHub included usage](https://docs.github.com/en/billing/reference/product-usage-included)
- [Render pricing](https://render.com/pricing)
- [Amazon Lightsail pricing](https://aws.amazon.com/lightsail/pricing/)
- [Tencent Cloud CVM pricing model](https://intl.cloud.tencent.com/en/document/product/213/2180)

任何价格都可能变化；采购前必须按最终区域、带宽、税费、备份、HA 和合同重新报价。
