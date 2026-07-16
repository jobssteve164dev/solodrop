# Cloudflare Drop × VS Code Agent 文件分享插件调研报告

调研日期：2026-07-16

## 一、结论先行

这个方向值得做，但产品定义需要准确：**Cloudflare Drop 不是“任意文件上传后自动预览”的网盘，而是“无需账号，上传一个静态网站目录或 ZIP，立即获得 `workers.dev` 预览地址”的静态站点发布器。**

因此，VS Code 插件不能把 PDF、DOCX、XLSX、图片或 Markdown 原样交给 Drop 后就期待出现统一预览页。插件真正需要完成的是：

> 选择 Agent 产物 → 本地生成安全、可阅读的静态预览站点 → 发布到 Cloudflare → 复制分享链接。

这反而构成了产品壁垒。Cloudflare 解决无账号部署、全球分发和链接托管；插件解决文件识别、格式转换、预览体验、敏感信息检查和生命周期管理。

建议做，但不要把产品定位为“Cloudflare Drop 的 VS Code 壳”。更准确的定位是：**Agent Artifact Share——把 Agent 生成的任何可交付成果，一键变成可浏览的分享页。**

## 二、Cloudflare Drop 到底是什么

Cloudflare 官方页面给出的流程非常明确：用户拖入一个包含 HTML、CSS、JavaScript 的静态站点文件夹或 `.zip`，Cloudflare 将其部署到全球网络并返回一个公开的 `workers.dev` URL；用户需要在 60 分钟内认领部署，否则临时账户和资源会被删除。[Cloudflare Drop 官方页](https://www.cloudflare.com/drop/)

它建立在 Cloudflare 新推出的 Temporary Accounts for Agents 机制上。Agent 或工具可以在未登录 Cloudflare 的情况下运行：

```bash
npx wrangler deploy ./dist \
  --name artifact-preview \
  --temporary \
  --compatibility-date 2026-07-16
```

部署结果包含两个不同链接：

- 公开预览链接：给接收者浏览内容。
- Claim 链接：给发布者认领临时 Cloudflare 账户；它是 bearer credential，不能发给接收者。

Cloudflare 官方文档要求本地 CLI 工作流优先使用 Wrangler，只有具备浏览器自动化且已有完整静态站点目录/ZIP 时才使用 Drop 网页。[Claim deployments 文档](https://developers.cloudflare.com/workers/platform/claim-deployments/) [Temporary Accounts 发布说明](https://blog.cloudflare.com/temporary-accounts/)

### 关键限制

| 维度 | Drop / 临时账户的当前边界 | 对插件的影响 |
|---|---|---|
| 输入 | 静态站点目录或 ZIP，必须有 `index.html` | 单文件必须先包装成静态预览站点 |
| 有效期 | 60 分钟内必须完成 Claim | “发完即走”不等于永久分享 |
| 未认领结果 | 临时账户及资源自动删除 | 链接会失效，不能用于长期交付 |
| 临时静态资产 | 最多 1,000 个文件；每个最多 5 MiB | 大 PDF、Office 文件、视频和大型 Agent 报告容易超限 |
| 更新 | 60 分钟窗口内可重复部署 | 适合同一轮 Agent 迭代预览 |
| 凭证 | 临时 API Token 与 Claim URL 都是敏感信息 | 插件不得写入日志、遥测或工作区 |
| API | 有正式 temporary provisioning REST API，但要做 proof-of-work | 直接调 API 比调用 Wrangler 更复杂 |
| 持续管理 | Claim 后平台不会自动获得长期权限 | 后续更新需要 Wrangler 登录/API Token/OAuth |

需要特别区分临时账户与普通 Workers：普通 Workers Static Assets 当前单文件上限为 25 MiB，免费/付费计划每个版本分别最多 20,000/100,000 个静态文件；临时账户的限制更紧，为 1,000 个、每个 5 MiB。[Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) 静态资源请求本身免费且不限量，但动态 Worker 调用按 Workers 计划计费。[Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)

## 三、它与“Agent 文件分享”需求的适配度

### 非常适合的内容

- Agent 生成的 HTML 原型、数据报告、可视化仪表盘。
- Markdown、纯文本、JSON、代码片段，经插件渲染成静态页面后分享。
- 多文件交付包，例如“报告 + 图片 + CSV + 附件索引”。
- 需要快速让非开发者通过浏览器查看的前端成果。
- 一次 Agent 会话中的临时审阅与反复更新。

### 可以支持，但必须在插件内转换

- PDF：生成带 PDF.js 或浏览器原生 `<embed>` 的预览页；临时模式受 5 MiB 限制。
- DOCX：用 Mammoth 等方案在本地转换为 HTML；版式不能保证完全一致。
- XLSX/CSV：本地解析为可筛选表格；大表需要分页或抽样，避免浏览器卡顿。
- PPTX：需要转为图片/HTML，纯前端高保真解析难度最高。
- 图片：生成画廊、尺寸信息和原图下载入口。
- 音视频：浏览器可播放格式可以包装，但 5 MiB 临时上限让 Drop 基本不适合作为媒体分享通道。

### 不适合直接使用 Drop 的场景

- 大文件、视频、模型文件、压缩包等纯下载交付。
- 需要密码、访问名单、到期撤销、下载审计的敏感分享。
- 希望链接自动长期有效、发布者不需要再操作的体验。
- 需要同一个永久链接持续覆盖更新的正式客户交付。
- 需要严格保留 Word、Excel、PPT 原始版式的在线预览。

## 四、产品机会判断

### 用户真正需要的不是“部署”，而是“交付”

Agent 已经能生成文件，但从文件到别人真正看懂，中间仍有明显断层：找到文件、判断用什么打开、导出格式、上传网盘、设置权限、复制链接、解释如何查看。插件如果把这些动作压缩成一次“分享预览”，价值非常直接。

Cloudflare Drop 的发布进一步证明了两个趋势：

1. Agent 需要无需登录、无需人工复制 Token 的临时发布目标。
2. Agent 产物需要在生成后立刻进入“部署—打开—验证—分享”的闭环。

但 Cloudflare 官方只提供部署原语，没有提供多格式文件预览、敏感信息治理、历史分享管理和面向接收者的统一页面。因此仍然存在清晰的产品空间。

### 差异化不应是“支持 Cloudflare”

单纯调用 `wrangler deploy --temporary` 很容易被复制，也可能被 VS Code、Cloudflare 或 Agent CLI 原生吸收。更稳固的差异化应集中在：

- 自动理解 Agent 产物类型并选择最佳预览方式。
- 把多个相关文件组织成一份有标题、摘要、目录和下载入口的交付页。
- 发布前扫描密钥、`.env`、个人信息和意外包含的内部文件。
- 在发布后自动打开链接并验证页面是否可访问、关键内容是否渲染。
- 提供临时分享、长期分享、撤销和重新发布的一套统一操作。
- 让 Agent 能通过 VS Code 命令或受控工具直接请求“分享这个产物”。

## 五、推荐的产品与技术方案

### 1. 用户入口

首版只保留三个自然入口：

- 资源管理器右键文件或目录：`分享为预览链接`
- 编辑器标题栏：分享当前文件
- 命令面板：`Share Agent Artifact`

执行后默认自动识别格式、生成预览、发布、复制链接。不要让用户先理解 Worker、静态资产、临时账户或部署类型。

### 2. 内部流水线

```text
文件/目录
  → 类型识别与大小检查
  → 敏感信息扫描
  → 预览适配器生成静态站点
  → 本地打开并校验最终 index.html
  → Wrangler 发布
  → 访问线上 URL 做最小验证
  → 复制公开链接并单独保管 Claim 链接
```

预览适配器建议先覆盖：

1. HTML/静态站点：原样部署。
2. Markdown/文本/代码/JSON：安全转义后渲染为阅读页。
3. 图片：画廊页。
4. PDF：PDF.js 或浏览器内嵌。
5. CSV/XLSX：静态表格预览。

DOCX 和 PPTX 放在第二阶段，因为它们的高保真转换成本显著更高。

### 3. 部署模式

#### 模式 A：临时分享

使用 `wrangler deploy --temporary`。优点是零账号、零配置、适合立即审阅；缺点是必须在 60 分钟内 Claim 才能保留，而且 Claim 是发布者动作，不适合作为无感长期分享。

适合作为首次体验和 Agent 会话内预览，但界面必须明确显示“若不认领，链接将在临时账户到期后失效”，并提供“认领并保留”动作。

#### 模式 B：长期分享

用户登录 Cloudflare 后执行普通 Wrangler 部署，或由插件通过 Cloudflare OAuth 获得最小权限。它绕过临时账户 5 MiB/1,000 文件限制，适合稳定使用。

首版建议优先复用本机 Wrangler 登录状态，不在扩展里保存长期 API Token。产品成熟后再做 Cloudflare OAuth，以便支持分享列表、覆盖更新和撤销。

#### 模式 C：自有分享服务（后续）

若产品要服务非 Cloudflare 用户并提供密码、到期、撤销、审计、大文件和稳定短链接，应使用自有 Worker + R2 + 数据库。此时 Cloudflare Drop 只用于零配置试用，不再承担正式分享存储。

## 六、安全与隐私

这是该插件成败的核心，不是附加功能。

- 默认排除 `.git`、`.env*`、私钥、Token、凭证目录、依赖目录和隐藏文件。
- 发布前展示最终将上传的物理文件清单、总大小和公开范围。
- 对文本内容做常见密钥与个人信息扫描；命中高风险项时明确指出文件和位置。
- HTML 预览默认使用严格 CSP；Markdown、代码和 JSON 必须转义，禁止把内容当 HTML 执行。
- 对用户提供的 HTML 成果要明确它将在独立公开域运行；不要在 VS Code Webview 权限模型和线上页面之间共享信任。
- 临时 API Token 只放进受限的临时进程环境；Claim URL 只展示给发布者，不写入终端日志、Output Channel、遥测或工作区配置。
- 发布完成后清理插件生成的临时预览目录；分享记录只保存公开 URL、文件指纹、时间和状态，不保存敏感凭证。
- 首版不要声称支持私密分享。`workers.dev` 预览链接应按“知道链接即可公开访问”理解。

## 七、MVP 建议

### 应该做

- 支持当前文件、多个文件和目录。
- 支持 HTML、Markdown、文本、代码、JSON、图片、PDF、CSV/XLSX。
- 生成统一、干净、可下载原文件的接收者页面。
- 发布前敏感文件排除与最终上传清单确认。
- 检测 Wrangler 版本与登录状态，自动选择临时或已认证部署。
- 发布后真实访问 URL，确认不是 404 且首页包含预期内容。
- 一键复制公开链接；Claim 链接与分享链接明确分离。
- 本地保留分享历史，并能重新打开、复制、覆盖发布或进入 Cloudflare 管理。

### 暂时不要做

- 自建账户、计费和团队系统。
- 复杂的 Office 高保真在线编辑。
- 直接把 API Token 存进 VS Code Settings。
- 用 Drop 承诺永久链接、私密权限或大文件交付。
- 同时支持多个云厂商；先把“产物到可读交付页”做扎实。

### 最小成功指标

- 用户从选中文件到复制链接不超过 15 秒（不含大文件转换）。
- 接收者无需登录或安装软件即可阅读。
- 90% 的常见 Agent 文本、代码、报告和数据文件可以正确生成预览。
- 任何失败都能指出是格式转换、大小限制、部署还是线上验证失败。
- 没有将密钥、Claim URL 或临时凭证写入日志和遥测。

## 八、主要风险

| 风险 | 严重性 | 应对 |
|---|---:|---|
| 用户误以为临时链接永久有效 | 高 | 分享成功页明确倒计时与 Claim 状态 |
| 5 MiB 临时单文件限制过小 | 高 | 发布前检查；已登录模式使用普通 Workers；大文件后续转 R2 |
| Agent 产物含密钥或内部资料 | 高 | 默认排除 + 内容扫描 + 最终清单确认 |
| HTML/Markdown 引入 XSS | 高 | 严格转义、HTML 隔离、CSP、安全头 |
| Office 预览失真 | 中 | 标记“转换预览”，保留原文件下载；逐格式测试 |
| Cloudflare 改变临时账户限制 | 中 | 部署适配层隔离，启动时能力检测，避免绑定网页私有接口 |
| Cloudflare/VS Code 原生吸收部署能力 | 中 | 壁垒放在产物理解、转换、安全与交付体验 |
| 每次分享产生大量 Worker 项目 | 中 | 分享历史、命名规则、覆盖更新与清理能力 |

## 九、最终判断

**建议立项，产品可行性为 8/10；但 Cloudflare Drop 本身的直接适配度只有 6/10。**

原因是 Drop 完美覆盖了“无需账号，把静态成果立刻变成 URL”这一关键瞬间，却没有覆盖“任意文件自动成为高质量预览”的核心工作，也不适合直接承担长期、私密、大文件分享。

最佳切入不是“把文件拖到 Cloudflare”，而是：

> 在 VS Code 里选中 Agent 产物，插件自动把它变成接收者真正能读、能看、能下载的网页，并立即给出链接。

首版用 Cloudflare Drop/Temporary Accounts 获得零配置体验，用已登录 Wrangler 提供长期分享；当用户证明需要私密分享、大文件和团队治理时，再演进到自有 Worker + R2 服务。这样既利用 Cloudflare 新能力快速上线，也不会让产品被 Drop 的 60 分钟认领和 5 MiB 限制锁死。

## 官方资料

- [Cloudflare Drop](https://www.cloudflare.com/drop/)
- [Temporary Cloudflare Accounts for AI agents](https://blog.cloudflare.com/temporary-accounts/)
- [Claim deployments (temporary accounts)](https://developers.cloudflare.com/workers/platform/claim-deployments/)
- [Workers platform limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Workers Static Assets headers](https://developers.cloudflare.com/workers/static-assets/headers/)
