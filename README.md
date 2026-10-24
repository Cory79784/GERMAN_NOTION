# Wortgarten · 德语记忆（免登录版）

**GPT → Notion → 手机／电脑学习网页。打开即学，无需访问口令。**

## 当前行为

- 网页自动读取 Notion：每次打开和点击同步时读取完整分页数据，不用重新部署内容。
- Notion 内容可由任何拿到网址的人读取；本版所有公开写入接口已关闭，网页不会修改 Notion。
- 积极／消极词汇、A–D 优先级、数字区间、主题标签、任意字段多选、AND / OR、文字搜索、空值筛选与常用筛选。
- 卡片翻转、双语例句、上下文、词族、记忆点、段落、系统德语朗读及间隔复习。
- 分类、评分、复习进度、筛选和字段显示设置均保存在**当前浏览器**。刷新与重新同步会保留本机进度；不跨设备共享，清除浏览器数据会丢失本机记录。
- Notion 新增条目会被同步；本机已覆盖的分类和复习字段以本机值为准，其他内容仍从 Notion 更新。
- 未填写用途或评分的条目保持空值，不自动猜测。不需要初始化 Notion 字段，本机可以直接批量分类。
- 示例模式不读取真实笔记，示例操作不保存到本机。

## 部署到 Cloudflare

在 Workers & Pages 中导入 GitHub 仓库 `Cory79784/GERMAN_NOTION`，创建 Worker：

| 设置 | 值 |
|---|---|
| Worker 名称 | `german-notion` |
| 分支 | `main` |
| 根目录 | 仓库根目录 |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy --config wrangler.jsonc` |

`wrangler.jsonc` 明确使用 `src/worker.js` 后端和 `public/` 静态资源，启用 `workers.dev`。不要仅上传静态目录或部署 Hello world 模板。

部署后在 Worker → Settings → Variables and Secrets 添加运行时 Secret：

| 名称 | 值 |
|---|---|
| `NOTION_TOKEN` | Notion 内部连接的 API 密钥 |

**无需 `APP_PASSWORD`**，以前添加的此项 Secret 不再使用，可以保留。数据源 ID `2aaff02b-8ca6-41bc-9c61-fb482528ccf3` 已在配置中。

在 Notion [集成管理](https://www.notion.so/profile/integrations) 新建内部连接，开启读取内容能力，并在 Content access 授权德语数据库。网页使用的密钥与 ChatGPT 的 Notion 连接独立。GPT 后续仍通过它自己的连接整理和写入笔记。

## 验证部署

打开网页地址后的 `/api/status`，新版本必须返回类似：

```json
{"version":"passwordless-v2","configured":true,"publicReadOnly":true,"progressStorage":"browser"}
```

- 返回 `Hello world`：线上没有运行本仓库的后端入口。检查构建命令、部署命令、分支、根目录和最新部署日志；这与 Notion 密钥或访问口令无关。
- `configured: false`：缺少 `NOTION_TOKEN` 或 `NOTION_DATA_SOURCE_ID` 运行时配置。
- 页面提示 Notion 未授权：检查内部连接是否有原数据库的访问权限。
- 页面提示 Notion 密钥无效：检查 `NOTION_TOKEN`。
- 新版页面仍显示旧登录表单：确认最新提交已部署，之后强制刷新页面。

服务器接口失败时只记录错误类型、请求路径与 HTTP 状态，不记录密钥、正文或学习内容。Cloudflare 的运行日志可在项目 Observability 中查看，是否保存取决于账户的日志设置。

## 本地开发

Node.js 22 或以上：

```sh
npm ci
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 填入 NOTION_TOKEN；不要提交真实密钥
npm run dev
```

```sh
npm run build
npm test
npx wrangler deploy --config wrangler.jsonc --dry-run
```

无前端运行时依赖，无额外业务数据库。Wrangler 和 happy-dom 仅用于开发、部署与验证。

## 边界

- 本版适合公开的语言学习材料，请勿在此数据库放需要保密的个人内容。
- 网页仅读取数据库属性，不读取条目页面正文。长句与段落可放在映射的例句、上下文和讲解字段。
- 未缓存所有私人笔记来提供离线阅读。Notion 内容需要联网同步；已经打开页面时，本机复习无需写入接口。
- 首次学习的新卡在「记忆卡片」开始，之后进入到期复习。新卡不会自动算成到期卡。
- 语音使用设备／浏览器的德语语音；可通过浏览器菜单添加到主屏幕。
- 自动 AI 评分和语义纠错尚未提供。

[Notion 数据源 API](https://developers.notion.com/reference/query-a-data-source) · [Cloudflare Worker 静态资源](https://developers.cloudflare.com/workers/static-assets/binding/)
