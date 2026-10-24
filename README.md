# Wortgarten · 我的德语记忆书房

手机优先的个人德语学习网页：**GPT → Notion → Cloudflare 网页**。代码存放在 GitHub，内容始终由你的 Notion 管理。无前端框架、无付费 AI API、无额外业务数据库。

## 已实现

- **组合筛选**：任意 Notion 字段，同一条件多选 OR，条件之间 AND / OR；文字包含、数字区间、已填写、未分类／未评分；全文搜索、匹配数量、排序、常用筛选。
- **积极／消极词汇**：需要主动说写 / 理解即可；与褒贬义无关。支持 A/B/C/D 优先级、书面程度及常用度 1–5 分。
- **主题学习**：德中对照，展开例句、双语上下文、词项讲解、词族、记忆点、个人错误和心得；长句与段落保留完整换行。
- **记忆卡片**：中→德 / 德→中、先回忆再翻卡、德语朗读、上一张、跳过和刷新续学。
- **间隔复习**：忘记 10 分钟后、模糊明天、记住逐步延长；连续三次独立回忆才标为掌握。进度写回 Notion，手机电脑共享。
- **批量分类**：选择条目后设置用途、优先级和评分；明确确认后写入，最多 100 条，失败条目仍保持选中，支持重试。
- **自定义字段**：读取实际 schema，映射读取／复习字段，自选卡片正反面、辅助内容和顺序；新增 Notion 属性同步后可直接筛选。
- **自动读取**：打开时读取 Notion 全量分页结果，手动同步刷新；任何一页失败都不会把部分结果伪装成完整同步。
- **个人访问口令**：服务端密钥、签名 HttpOnly 会话、同源写入检查。浏览器与 GitHub 均不包含真实 Notion 密钥。
- 未配置连接时可点击 **先体验示例内容**，不会读取或修改你的笔记。

## 最简单的上线方式

### 1. 准备 Notion 连接

1. 在 [Notion integrations](https://www.notion.so/profile/integrations) 新建内部集成，启用读取与更新内容能力，保存它的 API 密钥。
2. 打开原数据库菜单 → Connections / 连接，添加这个集成，授权该数据库。
3. 注意：ChatGPT 已连接的 Notion 插件与网页服务端使用的集成是两条独立连接，网页仍需自己的密钥。

项目已填入当前数据源 ID：`2aaff02b-8ca6-41bc-9c61-fb482528ccf3`。这是 data source ID，不是页面或视图 ID。换表时修改 `wrangler.jsonc` 的 `NOTION_DATA_SOURCE_ID`。

### 2. 在 Cloudflare 连接本仓库

在 Cloudflare 的 **Workers & Pages → Create → Import a repository** 中选择 `Cory79784/GERMAN_NOTION`，创建 **Worker**：

| 设置 | 值 |
|---|---|
| 根目录 | 仓库根目录 |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Worker 名称 | `german-notion`，与 `wrangler.jsonc` 一致 |

不要按“仅静态页面”部署；`src/worker.js` 负责私密读取与回写。

首次部署后，在 Worker 的 **Settings → Variables and Secrets** 添加以下运行时 **Secret**，保存并重新部署：

| Secret | 填写内容 |
|---|---|
| `NOTION_TOKEN` | 上一步的 Notion 集成 API 密钥 |
| `APP_PASSWORD` | 自己生成的较长随机访问口令，建议至少 16 个字符 |

不要把密钥放在 GitHub 文件里，也不要只设置成构建环境变量。访问口令用于你自己的设备登录；更换它会使已有会话失效。生产部署建议使用 Cloudflare 提供的限流规则保护 `/api/login`。

### 3. 首次进入网页

1. 输入访问口令，等到所有记录读取完成。
2. 打开 **设置 → 查看字段方案并初始化**，检查后确认。此操作仅补齐字段与选项，不会给条目自动分类、评分。
3. 按需批量设置学习用途、优先级及评分。
4. 保存常用筛选，例如：`标签含学术德语 AND 学习用途=积极词汇 AND Priority∈A/B AND 书面程度评分≥4 AND Mastery≠已掌握`。最后一项可用 Mastery 多选 `New / Learning / 空` 实现。
5. 点击记忆卡片开始学习，学过的内容会按计划进入今日复习。

数字评分为 1–5，数字越高表示越书面／越常用。原有「书面程度」「常用度」可能是公式或说明文本，仍保留并可按原文筛选；另用数字字段进行区间筛选，不猜测原文评分，不把未知值当成 0。

## 字段方案

| 用途 | 默认字段 | 行为 |
|---|---|---|
| 内容 | German / Chinese / Example 等 | 复用，按原值展示 |
| 主题 | 学习主题 / 子主题 / 标签 | 兼容公式、文本、多选 |
| 学习用途 | 学习用途（select） | 缺少时新增：积极词汇、消极词汇 |
| 优先级 | Priority（select） | 保留已有选项，补充 A/B/C/D |
| 书面程度 | 书面程度评分（number） | 缺少时新增，手动 1–5 |
| 常用度 | 常用度评分（number） | 缺少时新增，手动 1–5 |
| 分类来源 | 分类状态（select） | 人工确认 / 待确认；本版不自动推断 |
| 复习 | Mastery / NextReview / LastReviewed / ReviewCount / ReviewInterval / LastResult / IndependentStreak / ErrorCount | 复用，缺少时补齐 |
| 重试去重 | ReviewEventID（rich text） | 缺少时新增，记录最近复习事件 |

如字段类型冲突，应用会提示调整映射，不自动改掉已有字段类型。初始化前先保存或检查映射；可写字段不能重复映射到同一列。公式字段仅用于读取与筛选。

批量分类只修改明确选中的字段和「分类状态」。未选的字段保持原样；选择“清空”才清空。读写均局限于已配置的数据源。

## 本地开发与验证

需要 Node.js 22 或更高版本。

```sh
npm ci
cp .dev.vars.example .dev.vars
# 在本地编辑 .dev.vars，填入密钥与访问口令，不提交它
npm run dev
```

```sh
npm run build
npm test
npx wrangler deploy --dry-run
```

命令行部署：`npx wrangler secret put NOTION_TOKEN`、`npx wrangler secret put APP_PASSWORD`，然后 `npm run deploy`。首次运行 Wrangler 时按官方登录流程连接自己的 Cloudflare 账户。

测试覆盖筛选组合、未知评分、Notion 类型转换、复习调度、签名会话、跨站请求拦截、分页、批量分类边界、去重重试、跨设备过期进度检测、schema 保留，以及页面学习流程。GitHub Actions 自动运行检查与测试。

## 使用说明与当前边界

- 内容在打开网页和点击同步时重新读取，不需要重新部署。GPT 写入 Notion 后，下次同步即可看到。页面不会持续后台轮询。
- 筛选预设、字段显示设置和续学位置存于当前浏览器；复习状态存回 Notion。筛选预设暂不跨设备共享。
- 未缓存私人笔记以提供离线阅读。断网保存失败会保留一条待确认复习事件；联网后点“重试保存”，不会直接显示保存成功。
- 两台设备应避免同时评同一张卡片。保存前会检查最近复习时间，但 Notion 不提供此场景所需的原子比较写入；极端的同一时刻写入仍可能冲突。
- 今日复习仅包含已有到期日期的卡片。新卡从记忆卡片开始学习后进入复习计划。
- 内容取自数据库属性，暂不抓取记录页面正文。长文本请放在映射的例句、上下文或讲解属性中。
- 德语朗读使用浏览器和系统语音，是否可用、是否离线取决于设备。添加到主屏幕可通过浏览器分享菜单完成，部分设备对图标支持不同。
- 本版无自动 AI 评分、语义纠错或自动分类；原文、未知值与人工分类分开保留。
- 无真实密钥的测试只验证模拟接口和本地 Worker 打包；真正 Notion 权限和 Cloudflare 线上连接需配置后验证。

## 官方参考

- [Notion：查询数据源](https://developers.notion.com/reference/query-a-data-source)
- [Notion：更新数据源属性](https://developers.notion.com/reference/update-data-source-properties)
- [Cloudflare：静态资源与 Worker 绑定](https://developers.cloudflare.com/workers/static-assets/binding/)
