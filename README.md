# Wortgarten · 免登录、跨设备共享的德语记忆书房

**GPT → Notion → 手机／电脑学习网页**。打开同一个网址，直接显示学习界面，无欢迎页、无密码框，即可共享学习状态。连接失败只在学习界面内提示，不跳回主页。

## 共享哪些内容

| 内容 | 保存位置／同步方式 |
|---|---|
| 德语、中文、例句、上下文、讲解 | 原 Notion 字段；打开网页或点击同步时读取 |
| 积极／消极词汇、A–D 优先级、评分 | Notion 网页学习状态；不改原字段 |
| 掌握程度、复习次数、下次复习时间 | Notion 网页学习状态 |
| 常用筛选、当前筛选、排序、学习模式 | Notion 共享设置 |
| 卡片方向、字段映射、辅助内容及顺序 | Notion 共享设置 |
| 上次学习卡片 | Notion 共享设置，可在另一设备续学 |
| 尚未保存成功的复习／设置 | 当前浏览器暂存；重试成功后才标记已云同步 |

**这是一个共享的个人学习空间。持有网址的人可读取笔记并更改共同学习状态，没有多用户身份隔离。** 原始德语、中文、例句等内容只读，公开写入仅限网页学习状态。Notion 密钥始终在 Cloudflare 服务端。

## 功能

- 任意字段组合筛选：同一条件多选 OR、条件之间 AND / OR、数字范围、空值、文字搜索、保存预设。
- 积极词汇表示需要主动说写，消极词汇表示理解即可。未知评分保持空，不猜测、不当作零。
- 主题学习、双向记忆卡片、双语语境、词族、记忆点、长句和段落、设备德语朗读。
- 间隔复习：忘记 10 分钟后、模糊次日、记住逐步延长；连续三次独立回忆才标记掌握。
- 批量设置分类与评分，最多 100 条；失败条目保持选中。
- 自定义字段映射、正反面、辅助内容及显示顺序。
- 打开网页、返回页面或点击“同步”读取云端。设置自动保存时会显示“设置已云同步”。
- 示例模式不修改真实 Notion 数据，也不上传示例进度。

## Cloudflare 部署

在 Workers & Pages 导入 `Cory79784/GERMAN_NOTION`：

| 设置 | 值 |
|---|---|
| Worker 名称 | `german-notion` |
| 分支 | `main` |
| 根目录 | 仓库根目录 |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy --config wrangler.jsonc` |

配置指定 `src/worker.js` 和 `public/`，启用 `workers.dev`。不要仅上传静态目录或部署 Hello world 示例。

Worker → Settings → Variables and Secrets 中添加运行时 Secret **`NOTION_TOKEN`**。无需 `APP_PASSWORD`，旧的该项 Secret 不再使用。

数据源 ID `2aaff02b-8ca6-41bc-9c61-fb482528ccf3` 已在配置中。换表时修改 `NOTION_DATA_SOURCE_ID`。

## Notion 权限与保存方式

1. 在 [Notion 集成管理](https://www.notion.so/profile/integrations) 新建内部连接，开启 **Read content／读取内容**、**Update content／更新内容**。
2. 在 Content access 中授权德语数据库，并把连接密钥填入 Cloudflare 的 `NOTION_TOKEN`。
3. 首次保存时，程序自动补充一个 **`WortgartenState` 文本属性**，其余字段保持不变。

每条学习记录的网页分类和复习状态保存在它自己的 `WortgartenState` JSON 中。共享界面设置存于最早一条已有记录的同一属性，读取时会自动寻找该设置记录；不新增系统行，不改标题，不需要 Insert content 能力。该属性由网页管理，不要手动编辑 JSON。删除承载设置的记录会使共享界面设置丢失，其他条目的复习状态仍保留。

网页学习分类优先于原表分类显示，两者独立；原始属性仍可在 Notion 查看和编辑。源表新增词汇与例句会在下次同步读取。

GPT 使用它自己的 Notion 连接继续整理笔记，与网页连接独立。

## 验证线上版本

访问网页地址后的 `/api/status`，应返回：

```json
{"version":"shared-v3","configured":true,"loginRequired":false,"originalContentReadOnly":true,"learningShared":true,"progressStorage":"notion"}
```

- 返回 `Hello world`：线上未使用正确后端入口；检查构建／部署命令、分支、根目录、最新提交和构建日志。
- `configured: false`：缺少运行时配置。
- Notion 权限不足：检查连接是否有读取与更新内容权限，以及原数据库访问权限。
- 网页仍有密码框：线上仍是旧版本；确认最新提交部署成功后强制刷新。
- “设置尚未云同步”：草稿暂存本机；点击同步可重试，请勿误认为另一设备已经收到。
- 复习提示其他设备已更新：同步后重学，避免覆盖新的进度。

无需新增 Cloudflare 数据库或 KV 绑定。日志只记录错误路径与状态，不记录密钥或学习正文。

## 本地开发与验证

Node.js 22 或以上：

```sh
npm ci
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 填入 NOTION_TOKEN，不提交真实密钥
npm run dev
```

```sh
npm run build
npm test
npx wrangler deploy --config wrangler.jsonc --dry-run
```

测试包含两台独立模拟浏览器共享进度、分类、界面设置、筛选和续学位置，以及分页、重复复习事件、过期设备冲突、源内容写入限制和错误处理。模拟接口与打包检查不代表真实 Notion 权限及线上部署已经通过验证。

## 当前边界

- Notion 不支持这里所需的原子比较写入。避免两台设备在同一时刻修改同一条目；共享界面设置采用最后保存的结果，不做多人实时协作。
- 返回网页会同步，不持续后台轮询。想立即获取另一设备的修改，可点“同步”。
- 旧版仅保存在浏览器的分类／进度不会自动覆盖云端；当前以 Notion 网页学习状态为准。
- 读取数据库属性，不读取条目正文。长句与段落请放在例句、上下文、讲解等映射字段。
- 新卡从记忆卡片开始，之后进入到期复习；朗读取决于浏览器／设备语音。
- 可通过浏览器菜单添加到主屏幕。完整离线阅读、AI 语义纠错、自动评分和多用户账户暂未提供。

[Notion 数据源 API](https://developers.notion.com/reference/query-a-data-source) · [Cloudflare 静态资源](https://developers.cloudflare.com/workers/static-assets/binding/)
