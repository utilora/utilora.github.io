# Utilora 在线实用工具箱

Utilora 是一个基于 HTML、CSS 和 JavaScript 的免费在线工具集合，使用 GitHub Pages 自动发布。处理尽量只在浏览器中完成。

## 在线访问

https://utilora.github.io/

## 这次更新

- 增值税价税分离、报价单、个人所得税、到手工资
- JSON / YAML / CSV 互转
- 图片批量压缩并打包下载
- 二维码识别
- 词级简繁转换
- Markdown 预览与公众号 HTML
- 工具页可分享链接（`?q=`）
- 身份证号码结构校验

## 目录结构

```text
.
├─ index.html
├─ assets/
│  ├─ css/site.css
│  ├─ js/
│  └─ vendor/
└─ tools/
   ├─ data-convert/
   ├─ image-compress/
   ├─ markdown-preview/
   └─ ...
```

每个工具目录包含自己的 `index.html` 和 `tool.js`。

## 发布更新

```bash
git add .
git commit -m "更新网站"
git push
```

GitHub Pages 会在推送后自动重新发布网站。

## 新版架构

项目正在从静态脚本逐步迁移到 Vite + TypeScript + Supabase：

- 免费工具保持匿名、无需登录和本地优先；
- 财务专业版通过 Supabase Auth、会员权益和企业成员权限控制；
- 当前登录用户在内测活动期间获得专业版限时免费权益；
- 数据库迁移、RLS 和活动配置位于 supabase/migrations/；
- 架构说明见 docs/architecture.md，数据库运维见 docs/database.md。

本地开发：

    npm install
    npm run dev
    npm test
    npm run build

main 分支通过 GitHub Actions 构建 dist 并部署到 GitHub Pages。浏览器端只允许使用 Supabase publishable/anon key，禁止写入 service-role key。