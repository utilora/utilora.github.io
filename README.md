# A 股 AI 智能选股研究平台

面向内部研究与测试的 A 股日频分析平台。当前版本只提供工程骨架、演示状态页和健康接口，不提供证券投资建议、模型上涨概率、支付、券商连接或自动交易。

## 技术栈

- React + TypeScript + Vite + Ant Design + ECharts
- Python 3.12 + FastAPI
- PostgreSQL + Redis
- Docker Compose + GitHub Actions

## 本地启动

复制 `.env.example` 为 `.env`，然后运行：

```bash
docker compose up --build
```

- Web：http://localhost:5173
- API：http://localhost:8000/api/v1/health/live
- API 文档：http://localhost:8000/docs

也可以分别启动：

```bash
npm install
npm run dev

python -m venv .venv
pip install -e ".[dev]"
uvicorn apps.api.main:app --reload
```

## 验证

```bash
npm run typecheck
npm run build
pytest
ruff check .
```

完整设计见 `docs/`。真实数据源接入、模型训练和公开部署必须另行审批。

