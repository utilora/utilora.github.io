# Utilora

免费财税工具 + 专业财务工作台。顺手的工具，不该复杂。

- 免费工具：永久免费、匿名、无需登录，计算留在浏览器里。
- 专业版：登录后使用。当前内测限免，**未接支付**，不会自动扣费。
- 财务账本：存在本机 IndexedDB，不默认上云。

https://utilora.github.io/

## 能做什么

**免费工具**（打开即用）

- [增值税价税分离](https://utilora.github.io/tools/vat-split/)
- [个人所得税测算](https://utilora.github.io/tools/income-tax/)
- [工资与用工成本](https://utilora.github.io/tools/payroll/)
- [报价单](https://utilora.github.io/tools/quote/)
- [人民币大写](https://utilora.github.io/tools/number-chinese/)

**专业财务工作台**（登录或 [演示](https://utilora.github.io/pro/?demo=1#/dashboard)）

- 银行流水导入与收款匹配
- 应收回款、账龄、催收进度
- 月结检查与 Excel/CSV 底稿
- 本机完整备份与恢复（演示里的改动不保存）

## 本地开发

```bash
npm install
npm run dev
npm test
npm run build
```

`main` 经 GitHub Actions 构建后发布到 GitHub Pages。前端只用 Supabase 的 publishable/anon key，不要把 service-role 写进仓库。

## 约定

- 默认在 `main` 上改。一次只做 [docs/PRODUCT_OPTIMIZATION.md](docs/PRODUCT_OPTIMIZATION.md) 里的当前项。
- 给 AI 的规矩：[AGENTS.md](AGENTS.md)
- 验证码邮件模板：[supabase/templates/README.md](supabase/templates/README.md)
- 未授权不要接支付、不要做云同步、不要上传本地财务数据。
