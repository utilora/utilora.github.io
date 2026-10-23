# A 股 AI 智能选股平台：开源项目调研

> 调研日期：2026-10-23  
> 范围：第一阶段，仅做公开仓库与文档评估；未复制、合并或运行任何候选仓库代码。  
> 说明：Stars、Forks、提交数等是调研时快照，会随时间变化。许可证判断不构成法律意见；数据授权与证券业务合规须由专业人员复核。

## 1. 结论摘要

不建议直接 fork 任一候选仓库作为本项目的生产基础。建议建立干净的新代码库，以既定的 React + TypeScript + Ant Design、FastAPI、PostgreSQL、Redis、LightGBM、Docker 架构自主实现，并按模块借鉴以下设计思想：

1. **Web 与规则选股参考：`erishen/stock-analyzer`**。四个指定仓库中，与 React/FastAPI、指标 ETL、规则筛选和回测最匹配，适合做产品交互、增量指标计算、只读查询安全的设计参考。
2. **数据溯源与时点控制参考：`kevynf/stock-llm`**。其“来源、有效日期、抓取时间、可用状态”展示，以及历史日期只使用当时可见信息的原则，直接对应本项目的数据可信度和防未来函数要求。
3. **ML 研究基线参考：`microsoft/qlib` 与 `cyecho-io/ashare-lowfreq-research`**。前者适合因子、数据集、训练与实验抽象，后者展示 A 股低频 LightGBM walk-forward 工作流。两者都不应原样充当公众 Web 产品。
4. **回测可信度参考：`fkchaos/a-share-quant-sim`**。其滚动验证、回测与模拟共用路径、失败策略日志和对统计局限的主动披露，值得转化为本项目验收标准。
5. **自动日报参考：`MingJunMC/ai_trading_agent_eng`**。GitHub Actions 定时运行、多数据源和通知适配可借鉴；其 LLM 结论和交易措辞不能直接成为第一版能力。
6. **`fsdiyyds/quant_ashare` 仅适合原型参考**。覆盖 LightGBM/LSTM、选股、Actions、Codespaces/Streamlit，但仓库规模小、无明确许可证、验证严谨性证据不足，商业项目不得复制其代码。

推荐路线是“**自建产品骨架 + 独立实现关键算法 + 仅在审查后吸收 MIT 项目的局部设计**”。第一版继续坚持不展示未经验证的 AI 上涨概率、不接券商、不自动交易。

## 2. 评估方法

### 2.1 与目标的匹配项

- A 股全市场日频采集、股票主数据、复权行情与交易日历
- MA、MACD、RSI 等指标和横截面量化因子
- LightGBM/XGBoost 与未来 1、3、5 个交易日标签
- 时间序列切分、滚动训练、样本外回测与可复现实验
- React + FastAPI Web、自动任务、Docker 与 GitHub Actions
- 数据来源、数据时间、缺失与异常的可观测性
- 可商业使用的许可证与清晰的数据再分发权

### 2.2 评分口径

“匹配度”是对本项目目标的相对评价，不代表代码质量认证：高表示多个核心模块可作为设计参考；中表示覆盖部分关键能力；低表示主要目标不同或缺少生产所需证据。

## 3. 指定仓库逐项评估

### 3.1 erishen/stock-analyzer

- 仓库：[erishen/stock-analyzer](https://github.com/erishen/stock-analyzer)
- 调研快照：MIT；约 110 次提交、2 Stars、2 Forks；包含 `frontend`、`src`、`tests`、GitHub Actions、Dockerfile、Compose 和 Render 配置。
- 匹配度：**高（8/10）**；是否作为基础：**不直接 fork，作为最重要的产品与工程参考**。

**功能与架构**

项目公开说明覆盖 A 股日线 ETL、51 个指标、全市场信号扫描、70+ 技术及资产字段筛选、多策略回测、市场宽度/行业轮动、模拟组合，以及 React + Vite + TypeScript、ECharts、FastAPI Web。数据层以多个 SQLite 文件组织，适合单机工具，但不符合本项目多用户 PostgreSQL 目标。

**可借鉴模块**

- 指标增量窗口与避免全量重算的 ETL 思路。
- 规则条件的结构化表达、全市场扫描和排行榜交互。
- K 线、指标、回测曲线、市场宽度等 Web 信息架构。
- Text2SQL 的只读数据库、SQL allowlist、行数限制和令牌保护思路。
- 测试目录、容器化、前后端联合开发命令和 CI 组织方式。

**主要风险**

- README 能证明“有回测”，不能证明已正确处理 T+1、涨跌停无法成交、停牌、ST/退市、前复权/后复权边界、幸存者偏差、交易费用和点时数据；采用前必须逐条审计。
- SQLite 与文件式运行时设置不适合公网多用户、高并发、审计和租户隔离。
- AI/Text2SQL 即使只读仍有资源消耗、提示注入、元数据泄露和昂贵查询风险；公网版本需要独立查询服务、超时、成本限制和审计。
- MIT 允许商业使用、修改和分发，但复制实质代码时必须保留版权与许可证声明；第三方数据仍受各数据源条款约束。

### 3.2 kevynf/stock-llm

- 仓库：[kevynf/stock-llm](https://github.com/kevynf/stock-llm)
- 调研快照：MIT；约 7 次提交、12 Stars、1 Fork；包含 backend、frontend、Tauri、文档和 Actions。
- 匹配度：**中高（7/10）**；是否作为基础：**否，重点借鉴数据证据链与安全边界**。

**功能与架构**

本地优先的 A 股筛选研究应用，React 19 + TypeScript、FastAPI、SQLite、Tauri 2；规则先产生候选，可选 DeepSeek 做候选比较和只读问答。数据来自 AKShare 聚合的新浪、东方财富、巨潮资讯，以及 BaoStock；保存本地研究历史和自选股，密钥进入操作系统密钥库。

**可借鉴模块**

- 每个数据块展示来源、有效日期、抓取时间和可用状态。
- “历史研究保持固定”以及历史日期只使用当时已发布财报/行情的 as-of 语义。
- AI 缺失时规则引擎仍可运行；AI 只比较有证据的候选，不绕过候选池。
- 本地密钥库、只读研究对话、证据引用校验的安全思路。
- 股票代码/名称搜索、研究工作台和候选详情页的信息组织。

**主要风险**

- 提交历史短，生态和长期维护能力尚未得到验证。
- 本地 SQLite/Tauri 架构不能直接迁移为公众 SaaS 的账号、权限、限流和审计体系。
- DeepSeek 或任何第三方 LLM 会接触发送的研究上下文，需最小化数据、配置地域与保留策略，并禁止发送用户隐私和商业授权原始数据。
- AKShare/BaoStock 的库许可证不等于底层网站数据可被商业展示或再分发；必须逐源签约或取得授权。
- MIT 的代码商业条件宽松，但所有复用仍需保留声明并执行依赖许可证清单。

### 3.3 fsdiyyds/quant_ashare

- 仓库：[fsdiyyds/quant_ashare](https://github.com/fsdiyyds/quant_ashare)
- 调研快照：约 13 次提交、0 Stars、0 Forks；仓库页面未显示许可证资源；含 devcontainer、Actions、Streamlit、Dockerfile 和若干脚本。
- 匹配度：**中（6/10，原型层面）**；是否作为基础：**否**。

**功能与架构**

轻量脚本型 A 股量化原型，公开说明包含 AkShare/新浪取数、简化 Alpha158 因子、LightGBM/随机森林、LSTM、规则初筛、Top-K 输出和简易回测；提供 Streamlit、GitHub Actions、Codespaces/devcontainer、Render 等运行方式。

**可借鉴模块**

- 从取数、缓存、因子、训练、排名到报告的最小流水线拆分。
- Codespaces 与 Actions 定时任务的开发体验清单。
- 数据源失败时切换和缓存的需求设计。

**主要风险**

- **未发现明确 LICENSE：默认保留全部权利。商业项目不能复制、修改或分发其代码。** README 中“参考其他开源项目”不等于获得这些项目代码的再许可。
- 小提交历史和零社区采用度，缺少长期维护、漏洞响应和发布治理证据。
- “简易回测”与脚本内训练不足以证明无时间泄漏；需检查标签对齐、横截面标准化时间、停牌/涨跌停成交、股票池历史成分和调参污染。
- 每日临时训练单股 LSTM 或小样本模型很容易产生不稳定结果；Top-K 排名不是校准后的上涨概率。
- 依赖免费网页数据和 TensorFlow 等重量依赖，存在接口变更、Actions 超时、资源与供应链风险。

### 3.4 MingJunMC/ai_trading_agent_eng

- 仓库：[MingJunMC/ai_trading_agent_eng](https://github.com/MingJunMC/ai_trading_agent_eng)
- 调研快照：MIT；约 479 次提交、0 Stars、0 Forks；包含 API、应用、bot、data_provider、Docker、strategies、tests 和 GitHub 配置。
- 匹配度：**中（6/10）**；是否作为基础：**否，借鉴任务编排和数据提供者接口**。

**功能与架构**

定位是 A/H/美股每日 AI 分析、决策看板与多渠道推送，可在 GitHub Actions 无服务器运行。包含多数据提供者、技术/情绪/筹码分析、搜索、历史分析准确率回顾和多种通知渠道；依赖 Gemini、Tavily 等外部服务的部分功能。

**可借鉴模块**

- 定时分析任务、手动触发、密钥注入和结果产物的 Actions 编排。
- `data_provider` 抽象、失败降级和多市场代码规范化。
- 报告生成、任务状态、通知适配器和 Docker 运维材料。
- 历史预测记录与后验命中检查的“可验证”产品思路。

**主要风险**

- 项目侧重 LLM 研究报告和推送，不是严谨的横截面 ML 训练/滚动回测平台；“AI 回测准确率”不能替代可复现的订单级回测。
- “精确买卖点/行动清单”等表达对公众证券分析服务具有明显合规风险，本项目第一版不应采用。
- 多外部 API 扩大密钥、费用、配额、数据出境、内容许可和供应链风险；Actions 日志/产物要防止泄密。
- 479 次提交但社区指标很低，提交数本身不能证明第三方审计、维护者多样性或稳定发布。
- MIT 允许商业复用并要求保留声明；数据、新闻、模型输出和通知平台分别受独立条款约束。

## 4. 补充候选项目

| 项目 | 价值 | 许可证/商业条件 | 建议 |
|---|---|---|---|
| [microsoft/qlib](https://github.com/microsoft/qlib) | 成熟的 AI 量化研究框架，含数据集、Alpha158/360、LightGBM 等模型、记录器和回测抽象 | MIT；可商用，保留版权/许可 | 研究层强参考；评估是否作为离线训练依赖，不让其领域模型侵入 Web 核心 |
| [cyecho-io/ashare-lowfreq-research](https://github.com/cyecho-io/ashare-lowfreq-research) | A 股低频数据同步、因子、LightGBM walk-forward、as-of-date 与盘前流程 | MIT | 深入审查其时间切分和快照设计；不直接采用其存储布局 |
| [fkchaos/a-share-quant-sim](https://github.com/fkchaos/a-share-quant-sim) | 回测/模拟共用路径、滚动起点验证、失败策略日志、数据源 Provider | MIT | 作为回测验收与披露规范的首选参考；其文档也明确指出重叠 folds 等统计局限 |
| [akfamily/akshare](https://github.com/akfamily/akshare) | A 股数据接口覆盖广、原型效率高 | 库代码开源；底层数据权利需逐源确认 | 只作为演示/研发适配器，禁止把“接口可访问”等同于商业展示与再分发授权 |
| [ZhuLinsen/daily_stock_analysis](https://github.com/ZhuLinsen/daily_stock_analysis) | GitHub Actions 每日分析、Docker Compose、定时任务与多渠道通知资料丰富 | 使用前逐文件核验当前 LICENSE 和第三方依赖 | 仅参考自动化/部署，不采用面向用户的直接荐股话术 |
| [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) | 多 Agent 金融研究工作流，适合观察角色编排 | Apache-2.0；需保留 NOTICE/声明并复核商标、依赖 | 不作为 1–5 日数值预测基础；可在后期作为解释层实验 |
| [hsliuping/TradingAgents-CN](https://github.com/hsliuping/TradingAgents-CN) | 中文/A 股适配、FastAPI + Vue + Redis 等工程经验 | 混合许可证：核心与应用层条款不同 | 高许可证污染风险；未经法务逐目录确认，不复制代码 |

## 5. 横向对比

| 仓库 | A 股每日选股 | 指标/因子 | ML 方向预测 | 滚动验证 | React + FastAPI | Actions/容器 | 生产底座建议 |
|---|---:|---:|---:|---:|---:|---:|---|
| stock-analyzer | 强 | 强 | 弱/非核心 | 证据不足 | 强 | 强 | 不 fork；重点参考 |
| stock-llm | 中 | 中 | 无，规则 + LLM 比较 | as-of 思路强，ML 回测弱 | 强 | 中 | 不 fork；借鉴数据证据链 |
| quant_ashare | 强 | 中 | LightGBM/LSTM | 证据不足 | 无（Streamlit） | 强 | 不使用代码；仅看原型思路 |
| ai_trading_agent_eng | 中 | 中 | LLM 结论为主 | 有后验检查，严谨性待审 | API/WebUI，非目标栈证据不足 | 强 | 不 fork；借鉴编排/适配器 |
| Qlib | 非产品化 | 强 | 强 | 强工具能力 | 无 | 中 | 离线研究依赖候选 |
| ashare-lowfreq-research | 强 | 强 | LightGBM | 强 | 非公众产品重点 | 中 | 研究流水线参考 |
| a-share-quant-sim | 强 | 强 | 规则/因子为主 | 强且披露充分 | 无 | 中 | 回测规范参考 |

## 6. 建议复用边界

### 可借鉴但应自主实现

- 数据提供者接口、统一证券代码、交易日历和数据质量状态机。
- 指标增量计算、因子注册表、特征版本号和数据快照。
- 规则筛选 DSL、Top-K 排行榜和可解释命中原因。
- 时间序列/横截面切分、purge/embargo、walk-forward 和实验记录。
- 回测事件模型、不可成交状态、成本模型和结果披露模板。
- Actions 定时任务、失败告警、幂等重跑、容器健康检查。
- LLM 只读、证据约束、结构化输出和不可越权边界。

### 第一版明确不复用/不实现

- 未校准、未进行真正样本外验证的“上涨概率”。
- LLM 生成的精确买卖点、收益承诺或个性化投资建议。
- 券商连接、自动下单、实盘仓位管理。
- 来源不明的历史数据库、训练数据、新闻全文或网页抓取结果。
- 无许可证仓库的代码，以及混合许可证中商业条件不清的应用层代码。

## 7. 数据、模型、回测和安全风险清单

### 7.1 数据授权

- 开源客户端许可证仅覆盖客户端代码，不自动授予底层行情、财务、公告、新闻的缓存、加工、公开展示、商业使用或再分发权。
- 演示模式应使用明确可分发的合成/小样本数据；真实生产源通过 `MarketDataProvider` 适配器接入，合同中明确用途、用户数、展示粒度、留存和派生数据权利。
- 保存 `source_id`、供应商记录时间、交易日期、抓取时间、调整因子版本、修订版本和质量标志，做到每个页面数字可追溯。

### 7.2 未来数据泄漏与统计偏差

- 标签按交易日历生成 `close[t+h] / close[t] - 1`，特征截止到决策时点；若按收盘计算信号，最早成交价必须从下一可交易时点开始。
- 财务数据以实际公告时间而非报告期结束日入模；指数成分、ST、上市/退市状态使用历史点时快照。
- 标准化、缺失值填充、特征选择和超参数搜索只在训练窗拟合；验证窗和测试窗不可反向参与。
- 1/3/5 日重叠标签会造成样本相关，应使用时间切分、purge/embargo，并报告每个滚动窗口和完整拼接 OOS 序列，而非只报平均值。
- 概率必须做 OOS 校准并报告 Brier score、log loss、校准曲线、分层命中率和基准；否则 UI 只能展示规则分数或模型原始排名，不能称“概率”。

### 7.3 A 股回测约束

- T+1 卖出限制；主板、创业板、科创板、北交所及 ST 股票不同涨跌幅规则，并考虑规则的历史变更。
- 停牌、涨跌停封单、成交量/流动性不足时不可假定按收盘价成交。
- 佣金最低收费、印花税历史变更、过户费、滑点和冲击成本应按日期版本化。
- 明确前复权用于展示/因子还是后复权用于收益连续性；交易模拟应使用可成交原始价格并正确处理公司行动。
- 纳入新股等待期、退市、股票更名、代码变更和历史股票池，避免幸存者偏差。

### 7.4 应用与供应链安全

- 第三方仓库只做人工审查，不执行其安装脚本和 Actions；任何代码引入需记录来源 commit、许可证、修改和安全审查。
- Python/Node 依赖锁版本，启用 Dependabot、依赖审计、secret scanning、SAST 和最小权限 Actions；第三方 Action 固定到 commit SHA。
- 生产数据库与模型任务分权；API 只暴露允许的查询；限制导出、速率、SQL 时间、响应行数和后台任务资源。
- LLM API key、数据源 token、数据库凭据只进入服务端 secret store，不写入前端、镜像、日志、缓存或 CI artifact。

## 8. 监管与产品风险标记

面向公众持续提供 A 股筛选、预测、评分、买卖倾向或个性化输出，可能触及证券投资咨询、金融信息服务、广告宣传、算法治理、数据合规和网络安全要求。以下内容在专业法律与合规意见完成前均设为发布阻断项：

- “上涨概率”“推荐”“买入/卖出”“目标价”“胜率”等表述及排序逻辑。
- 按用户风险、持仓或资金情况生成个性化建议。
- 收费、会员权益、导流开户、券商连接和自动交易。
- 真实行情/财务/新闻数据的公众展示和再分发。
- 模型效果宣传、历史回测展示方式、风险揭示和利益冲突披露。

免责声明不能替代所需资质或数据授权。MVP 应明确定位为研究工具，展示方法、数据时间、局限与可复现回测，不作收益承诺。

## 9. 对第二阶段架构的输入

后续架构设计应固定以下边界：

1. 产品服务与研究引擎分离：Web/API 不直接训练模型；训练、预测、回测由可审计任务执行。
2. 数据源适配器与内部标准表分离：免费演示源和未来商业源可替换，原始数据与授权范围有独立治理。
3. PostgreSQL 保存主数据、标准行情、因子元数据、任务、回测和用户数据；Redis 只做缓存、锁和任务队列，不作为事实源。
4. 规则排行榜先上线；模型输出必须经过离线门禁、滚动 OOS 验证、概率校准和模型卡审批才可能进入公开 UI。
5. 回测必须与预测使用相同的特征版本、交易日历和可交易性规则，并完整记录代码 commit、数据快照、参数和成本版本。
6. 所有页面都呈现来源、有效时间、更新时间、质量状态；异常数据默认降级或阻断，不静默填充。

## 10. 来源

主要事实来自调研日可访问的仓库主页、README、LICENSE 与目录：

- [erishen/stock-analyzer](https://github.com/erishen/stock-analyzer)
- [kevynf/stock-llm](https://github.com/kevynf/stock-llm)
- [fsdiyyds/quant_ashare](https://github.com/fsdiyyds/quant_ashare)
- [MingJunMC/ai_trading_agent_eng](https://github.com/MingJunMC/ai_trading_agent_eng)
- [microsoft/qlib](https://github.com/microsoft/qlib) 与 [Qlib LICENSE](https://github.com/microsoft/qlib/blob/main/LICENSE)
- [cyecho-io/ashare-lowfreq-research](https://github.com/cyecho-io/ashare-lowfreq-research)
- [fkchaos/a-share-quant-sim](https://github.com/fkchaos/a-share-quant-sim)
- [akfamily/akshare](https://github.com/akfamily/akshare)
- [ZhuLinsen/daily_stock_analysis](https://github.com/ZhuLinsen/daily_stock_analysis)
- [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents)
- [hsliuping/TradingAgents-CN](https://github.com/hsliuping/TradingAgents-CN)

在任何实际代码复用前，应重新锁定来源 commit 并逐文件核验 LICENSE、NOTICE、依赖锁文件、生成文件来源和数据条款；本报告不是代码引入批准。
