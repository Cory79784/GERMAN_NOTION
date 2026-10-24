# Wortgarten · Notion 德语记忆书房

GPT 整理到 Notion，网页读取全部分页。无需登录，手机电脑共用学习进度与 Cloudflare 界面设置。

## 数据边界

| 数据 | 存储与权限 |
|---|---|
| 德语、中文、主题、标签、优先级、评分、原有复习字段 | Notion 原字段，只读 |
| 本版复习时间、结果、计数、调度与重试事件 | 每行固定的 `学习记录` 文本列 |
| 字段映射、筛选预设、当前筛选、界面设置、续学位置 | Cloudflare SQLite Durable Object |
| 旧 `WortgartenState` | 保留原样，不读取其中分类、设置或进度，不迁移、不删除 |

服务端删除了分类写入能力。Notion 客户端对写请求使用白名单：仅查询当前数据源、缺少时添加 `学习记录` 一列、更新指定数据源中已有且未归档记录的这列。没有新增笔记、删除、归档或修改原字段的接口。客户端不能指定写入字段。

Notion 的 Update content 权限本身不能按列细分：本项目的列限制由服务端代码执行。内部连接保留 Read content、Update content 即可，不需要 Insert content。只在 Content access 授权需要学习的数据库。

`学习记录` 由软件维护 JSON，包含最后复习时间、中文结果（记住／模糊／没记住）、间隔、下次复习、次数、连续记住次数和最近 100 个事件 ID。同一事件重试不重复计数；已更新的记录拒绝过期设备写入。Notion 不提供原子比较更新，请避免两台设备同时评分同一条。坏 JSON 不阻止浏览原笔记，但拒绝覆盖该记录。

原 `Mastery`、`NextReview` 等保留并可按原字段筛选。本版的调度单独使用 `学习记录`，筛选器中的 `复习·...` 是网页派生字段，不会覆盖原列。

持有网址的人可读取笔记并更新共同复习状态／界面设置。Notion 密钥只在服务端。

## 筛选与卡片

- 学习主题默认映射到 `学习主题`；主题大类映射到 `Topic`。界面显示实际来源列名与类型，可在设置中修改。
- 所有选项来自完整数据与该列的 Notion 选项定义；多选属性拆成独立值，不猜测拆分文本／公式字符串，不混用标签。
- 主题、主题大类、优先级 A/B/C/D、用途、原文常用度／书面程度与数字评分均有独立入口。缺少字段明确提示；C/D 可选但不替 Notion 创建选项或填写数据。
- 空值提供“未分类”；同字段多选 OR（重复多选条件也合并），不同字段默认 AND，也可显式选择 OR。
- 原文星级或说明不自动变成数字评分。积极词汇指主动说写，消极词汇指理解即可。
- 所有主题选项与计数基于完整数据，不受筛选和复习队列影响。
- “练这张卡片”是单卡队列，完成后显示“本轮复习完成”及返回全部内容／重新开始入口。原卡片仍可浏览。
- 保存成功才推进；失败保留当前卡片并允许重试。分页中途失败、重复游标、重复记录都不会以部分数据替换完整旧数据。
- 示例不写入真实 Notion 或 Cloudflare。

## 部署

Cloudflare Workers 连接仓库 `Cory79784/GERMAN_NOTION` 的 main 分支，根目录为仓库根目录。

```text
Build command: npm run build
Deploy command: npx wrangler deploy --config wrangler.jsonc
```

运行时 Secret 添加 `NOTION_TOKEN`，无须 `APP_PASSWORD`。数据源 ID 已写入 `wrangler.jsonc`。

必须部署完整配置：它同时声明静态资源和 `SHARED_PREFERENCES` Durable Object 绑定；`preferences-v1` SQLite migration 会在部署时创建共享设置存储。无须手工创建 KV／D1 或填写数据库 ID。不要删除已应用的 migration。设置采用最后保存结果；返回网页或点同步可读取另一设备的最新设置。

第一次复习才会创建 `学习记录` 文本列；不会为每次复习新增列，也不会创建系统笔记行。若同名列类型冲突，用户需自行检查，软件不改类型。

`/api/status` 应报告 `version: review-only-v4`、`reviewField: 学习记录`、`preferencesStorage: cloudflare`。`/api/diagnostics` 可核对密钥连接名称、数据源与数据库访问情况，不输出密钥、邮箱或上游原文。

## 本地验证

Node.js 22+：

```sh
npm ci
npm run build
npm test
npx wrangler deploy --config wrangler.jsonc --dry-run
```

开发时使用 `npx wrangler dev`，本地 Secret 放 `.dev.vars`，不要提交密钥。测试覆盖真实 Worker 路由、两台独立模拟浏览器、完整分页、公式／多选主题、独立 A–D 筛选、单卡完成、保存失败重试、跨设备续学和所有写入仅限一列。线上只读审计与字段建议见 [AUDIT.md](AUDIT.md)。
