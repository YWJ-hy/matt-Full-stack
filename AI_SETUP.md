# AI 实施手册

首次接入或升级在共同父目录单开环境会话。`.matt/workflow.json` 的 `e2e.enabled` 控制是否验收，`e2e.provider` 选择 `orca` 或 `midscene`。只有 Midscene 需要第 2 节的模型和隔离链路。登录、真实业务服务和业务用例留给启用 E2E 的需求会话。

**体验项目：** 创建脚本已安装工具。两种模式都从第 1 节的「配置父目录的 Matt 工程约定」继续；体验项目选择 Midscene 后继续第 2 节，两端的 `selftest/` 夹具已备好。

## 1. 确认边界，预览再安装

首次接入且尚无选择时，先问用户：「只做开发派单（推荐），还是同时启用浏览器 E2E？」用户已说明则直接采用。交互终端也会在首次 `init --apply` 询问；非交互环境须传 `--e2e off` 或 `--e2e on`。已有配置直接沿用，升级见第 5 节。已接入 Orca 团队的工作区首次开启时默认选 Orca；团队配置尚未创建时，初始化用 `--e2e on --e2e-provider orca`。普通工作区默认使用 Midscene。

在**消费父目录**启动终端；定位本地工具包。下例是 PowerShell（所选模式为仅开发；启用 E2E 时将两条命令的 `off` 改为 `on`）：

```powershell
$matt = 'C:\path\to\matt-full-stack\bin\matt.mjs' # 替换成发现的绝对路径
node --version
node $matt discover
node $matt init --e2e off
node $matt init --e2e off --apply
node $matt init
```

使用 Node 22.12+ 的受支持 LTS 版本。上游独立保存；不需要发布 npm 包或把下游变为 monorepo。可用 `--workspace <父目录>` 显式指定目标。末次输出 `changes=0` 仅表示工具文件同步完成。父目录不必有 `.git`；不自动建立、嵌套或提交 Git 仓库。已有子仓的安装、调试、提交仍按各自指令执行。

`discover` 只看直接下属 Git 仓库（含 worktree）、根级包/锁/启动脚本及 README 的本地地址；输出是**候选**。只读核对技术栈和仓库指令，不搜索 `.env`、浏览器配置或历史凭据。`.matt/workspace.json` 的 URL 和启动命令留给业务验收，初始化时不访问、不执行，也不改写为夹具地址。已有两个空 Git 仓但技术栈尚未选定时，先请用户确认两端选型，不用示例栈代替。

核对 `.matt/workspace.json` 中的前后端仓库；有歧义时请用户确认。用 `node .matt/runtime/sessions.mjs` 检查派单角色设置。

### 配置父目录的 Matt 工程约定（两种模式共用）

在**两个业务仓库的共同父目录**检查原版 setup 的产物：`CLAUDE.md`（没有则看 `AGENTS.md`）的 `## Agent skills` 段，以及它引用的 `docs/agents/issue-tracker.md`、`docs/agents/domain.md`；使用 `triage` 时还需 `docs/agents/triage-labels.md`。读到本项目的工单归属和领域文档布局即可复用，不要求预先创建空术语表或 ADR。

缺失或不完整时，请用户在**同一环境会话**显式发送 `$mattpocock-skills:setup-matt-pocock-skills`。这是交互式 skill，不是 shell 命令：先确认选择和草案，再写入父目录；保留已有内容，`## Agent skills` 放在 `matt-full-stack` 受管标记之外。不要到工具包、前端或后端重复运行。若宿主没有该 skill，提示启用原版插件后继续，不能把 `init --apply` 或 Midscene 自测当作替代。

父目录没有 Git 仓库时，推荐使用父目录的本地 Markdown 工单（`.scratch/`），无需 `git init`。若选择 GitHub/GitLab，由用户确认用于全栈工单的远程仓库及必要的 Git/标签操作；不默认借用子仓 remote。工单可链接 `spec/<需求名>/shared.md`，两端以同一份公共契约为准。

父目录约定齐备后，**仅开发在此结束**：报告「开发派单就绪」，不准备模型、浏览器或夹具。Midscene 继续第 2 节。Orca 直接按父层 `.agents/skills/matt-full-stack/references/acceptance.md` 开展用例设计与原生浏览器验收。

## 2. 准备 Midscene 运行环境

**先向用户收齐模型配置。** 在消费父目录运行 `node .matt/runtime/run.mjs model-config`。它不联网，只列缺少的字段，不显示已有值。初次接入缺少配置是预期结果：此时暂停后续步骤，直接问用户缺哪几项；已有的不要重复问，也不要用默认值代填。

- 缺少非敏感项时问：「你要用哪一个视觉模型？请提供服务商的 base URL、模型名和匹配的 Midscene family。」只问检查点名的项。
- 缺 API key 时发起安全输入。在 T3 中用 `request_secret` 文件交付；没有安全输入功能时，请用户在本地私密编辑器填写 `.matt/private/model.env`，完成后告知。不要让用户在聊天中粘贴 Key，也不要打印凭据文件、请求头或原生 `model verify` 输出。
- 写入前检查父目录的 `.gitignore`。若父目录有 Git，用 `git check-ignore .matt/private/model.env .matt/private/state.json .matt/reports/sample` 和 `git ls-files -- .matt/private .matt/reports midscene_run e2e/midscene_run` 确认私有路径均被忽略且未被跟踪。限制私有目录和文件为当前用户可读写；仅在文件不存在时从 `.matt/model.env.example` 复制。按缺项补齐，保留其他模型设置；不要从 shell、业务 `.env` 或其他项目借用凭据。
- 重跑 `model-config` 确认无缺项。向用户确认允许向所配置端点发送 Midscene 的验证请求（含测试图像，可能计费），再执行下面的 `setup`。用户未提供必要信息或未授权时，明确报告「初始化未完成」并说明还缺什么，不能用确定性冒烟替代。

**准备浏览器和隔离夹具。**

```powershell
npm.cmd ci --prefix .matt/runtime --ignore-scripts --no-audit --no-fund
node .matt/runtime/run.mjs chromium
```

父层依赖和锁位于 `.matt/runtime/`；浏览器使用 Playwright 缓存。Linux 缺系统库时由有权限的维护者运行 `node .matt/runtime/node_modules/playwright/cli.js install-deps chromium`。所有 `run.mjs` 命令从消费父目录运行。

`init` 只写父目录。**环境会话**在前后端仓各自的测试目录中复用或编写以下入口，保持与项目相同的语言、框架和代理/API 地址配置方式。它们不进入生产构建、路由或启动链。

- **后端**：启动独立的本地测试服务，只处理 `GET /__matt_selftest/marker?run=<UUID>`。进程启动时在内存生成一个随机实例值；每次返回 JSON `{"marker":"<实例值>:<run>"}`，禁用缓存。既不导入业务应用，也不初始化 ORM、数据库（含测试库）、迁移、种子、队列或后台任务。
- **前端**：用独立测试入口提供 `/__matt_selftest.html?run=<UUID>`。页面通过真实 HTTP 向指定后端夹具请求上述标记，将响应的 `marker` 原样写入可见的 `[data-matt-marker]` 元素。优先按项目惯例使用同源代理；项目使用直接 API 地址时只允许本机夹具 origin。勿在页面硬编码结果或拦截请求来返回 mock。
- **启动条件**：先审查依赖安装钩子与启动链，仅装必要依赖；两端用隔离配置，不加载业务 `.env` 或数据库凭据。只监听 `127.0.0.1`，用两个不同且未被占用的夹具端口，确认本次进程实际绑定成功再运行用例。若缺技术栈、子仓写权限或无法排除业务副作用，记录阻塞，不改跑业务服务。

```powershell
node .matt/runtime/run.mjs setup 4273 4274  # 示例：实际的前端、后端夹具端口
```

`setup` 先执行原生 `model verify`，通过后才运行隔离自测 `ENV-01`。夹具使用全新 Chromium 上下文和本次 UUID 核对标记，不接收模型凭据，不加载业务登录钩子、用例或健康地址。两步都通过才报告环境就绪；否则报告失败的步骤，不交接到需求会话。记录模型验证结果（不含凭据）、夹具启动命令和报告位置（`.matt/reports/selftest-*/`），只停止本次启动的进程。单独排障可运行 `model` 或 `selftest <前端端口> <后端端口>`，各自通过都不代表初始化完成。

## 3. Midscene 的业务登录与用例

报告可能含页面、Cookie 相关错误或截图，按第 2 节保护私有文件，不复制真实数据，不上传报告。CI 从 Secret Store 临时落盘并按环境策略销毁。

- **登录：** 读项目现有登录实现，选择授权的测试租户/最小权限账号。Cookie 或 localStorage 会话可在本机专用测试浏览器中交互登录：`node .matt/runtime/node_modules/playwright/cli.js open --browser chromium --save-storage=.matt/private/state.json <实际测试前端URL>`，用户登录后关闭窗口。将 `e2e/login.mjs` 的 `session` 设为 `{ storageState: '.matt/private/state.json' }`。sessionStorage、测试 token、API 换票或 SSO 请用项目自有机制实现 `prepare({ page, context, workspace })`，只对已核实的测试 origin 注入；不要将业务凭据写入模型文件、YAML、提示词或公共 spec。此 hook 每个 YAML 文件启动一次，同一文件内的 case 共用页面；独立角色分文件，或显式复位。
- **视觉步骤：** `aiAct`、`aiAssert` 使用初始化时已验证的模型。业务测试页面不同于初始化验证图像；发送前确认页面数据和费用已获授权。
- **业务用例：** 查前端路由表、权限守卫、请求封装和后端 handler，核实入口和读回点；开发前由验收方维护或复用 `e2e/cases/*.yaml`，不让用户逐页报 URL。例（按真实契约替换），这不是可直接宣布通过的验收项：

```yaml
cases:
  - name: 已授权测试角色能读取预置的合成草稿
    steps:
      - app.open: /drafts
      - aiAct: 在草稿搜索框输入验收用编号 QA-017 并点击搜索
      - aiAssert: 结果列表中编号 QA-017 的行显示状态「草稿」
```

## 4. 验收与交接

### 跨工具会话配置

在消费父目录编辑 `.matt/sessions.json`。`init` 或 `update --apply` 首次生成它，之后由项目维护。`frontend` / `backend` 控制实现会话，`standards` / `spec` 控制两端各自的审查会话。下面的配置让两端各用独立 worktree，规范审查继承本端模型，需求审查使用指定模型。

```json
{
  "version": 1,
  "roles": {
    "frontend": { "model": "@coding", "worktree": true },
    "backend":  { "model": "inherit", "worktree": true },
    "standards": { "model": "inherit", "worktree": false },
    "spec": { "model": "@review", "worktree": false }
  }
}
```

`model` 接受当前工具的真实模型 ID、`inherit` 或 `@别名`。省略角色或字段时默认 `inherit` 和 `worktree: false`。使用别名时，在 `.matt/private/models.json` 填入当前工具的映射，例如 `{"coding":"当前工具的实现模型ID","review":"当前工具的审查模型ID"}`。同一台机器切换工具时，可用 `--models .matt/private/另一工具.json` 选择对应映射文件。相对路径以消费父目录为准。映射只填模型 ID；浏览器视觉模型仍在 `model.env` 配置。

```sh
node .matt/runtime/sessions.mjs
node .matt/runtime/sessions.mjs spec --models .matt/private/另一工具.json
node .matt/runtime/sessions.mjs frontend --worktree-base
```

命令输出可供任意会话工具读取的 JSON。`freshContext: true` 表示新派的实现或审查角色只接收本单，不复制父会话历史；可用 subagent 或新会话，与 `worktree` 是否隔离 checkout 无关。派发者使用宿主实际提供的模型选择、工作目录、工作树及权限机制，并按派单模板回报结果。只能手动开会话的工具也可以使用同一份输出开会话并粘贴派单。模型不可用或无法满足隔离时标记待派发，由使用者选择合适的工具或调整配置。

Orca bot 团队另见同目录 [ORCA_SETUP.md](ORCA_SETUP.md)。派单追加 `--host orca`：本次 `--model` 优先于角色模型，未指定则用接单 bot 自身默认模型。旧 `inherit` 在该模式下也按 bot 默认处理，输出 `model: null`、`modelSource: bot-default`；不会继承主控或实现 bot。Standards 与 Spec 的接单方是 Quality。其他宿主不加此参数，保留原有模型语义。

最后一条用于启用隔离的实现角色。`worktreeBase` 保留原 checkout、branch、sha 和 dirty，另给出实际起点 startSha、合回目标 targetBranch 和 targetSha。代码依赖用 `--requires-sha <已交付提交>`，多项可重复，指定组合起点用 `--start-sha`，另选已约定的本地目标用 `--target-branch`。由宿主创建任务树，Orca 继承仓库的 setup；连续阶段和返修在原树继续。

两个入口从消费父目录运行 `node .matt/runtime/tasks.mjs list` 核对批准、认领、执行者、返回会话和工作树占用。派单命令见 `.agents/skills/matt-full-stack/references/claims.md`，试合并、复验和清理步骤见同目录 `worktrees.md`。升级时，已有 `spec/_templates/` 模板继续由项目维护；新交付在沿用模板时按指南补记批次、试合并版本及清理授权。

### 选择父会话工作流

在共同父目录调用 `$matt-full-stack`，说明需要什么交付物即可。例如：

- 「只调研工单并发领取方案，不改产品代码。」父会话交付调研结论，不派实现单。若宿主缺少 `research` 且工具包无本地参考，说明缺失并停止。
- 「只排查：领取工单后刷新又变成未领取。」先复现并定位，报告证据即停，不改产品代码。说「排查并修复」才向已定位的端派单，再用原操作复验。没有现成 spec、YAML 或原开发会话也能开始；关闭 E2E 不影响排障。
- 「只修后端，按已确认的契约返回 409。」已有失败证据就随单复用，仅派后端。已全部提交的改动审固定 SHA；有未提交内容则审完整补丁，不以 `...HEAD` 代替。
- 「只审前端相对 main 的改动。」按工作区映射进前端仓解析 `main`，不在父目录或后端运行这次审查。若需求来源是工单，把完整 URL 或父目录相对路径随报告交回；没有修复或回写授权就只出报告。
- 「只验收当前版本的领取工单场景。」启用 E2E 时核对版本、运行已有 case 并报告结果；失败也不自动派修复。仅开发项目说明当前设置，由用户决定是否切换。

新功能或行为变更自动使用 `grilling` 和 `domain-modeling`，不要求另行手动启动原版 `grill-with-docs`。父会话提交 `spec/<需求名>/shared.md` 和涉及端的 `frontend.md`、`backend.md` 供用户评审，即使没有问题要问也要等待这版获批，然后分别派公共 spec 和本端 spec。自动派单无需手动启动原版 `implement`。仅开发时按场景或修复单登记版本、测试与审查结果；修复还需重跑原复现。注明「按项目配置未执行 E2E」，不编写 YAML，不执行下节的组合验收。

### 执行验收（仅 E2E）

先运行 `node .matt/runtime/run.mjs plan`。由验收方按父层 `references/acceptance.md` 执行事先确定的用例。Orca 使用原生浏览器，以下命令仅用于 Midscene。验收时核实 `.matt/workspace.json` 的业务测试地址与版本，启动授权的测试服务；`doctor` 检查这两个地址和 Chromium，`nodes` 生成编写 YAML 用的节点清单。单文件运行 `node .matt/runtime/run.mjs test e2e/cases/<场景>.yaml`，全量运行 `node .matt/runtime/run.mjs test`。以退出码、原生 summary/HTML、具体 case 与预期对应关系为证据。`.matt/reports/<运行ID>/receipt.json` 记录本地 checkout SHA 和 dirty 状态；**不是**已部署版本证明。核对服务构建标识或启动记录、真实账号/后端与合成数据；新功能记录在 `spec/<需求名>/delivery.md`，只验收或修复沿用已有依据。任何缺项标为未验证/阻塞。工具返回零不自动签收。注意数据清理、测试幂等和不同角色隔离。

## 5. 升级、切换模式与冲突

升级后按第 1 节检查父目录的 Matt 约定：旧项目缺失时补做一次，已有配置不因升级或切换 E2E 而重建。

1.11 起，新需求使用 `spec/_templates/` 中的分文件模板。升级保留旧的 `spec/full-stack.md` 及已有单文件需求，不自动拆分、不使历史批准失效。继续旧功能时，父会话可从原稿提取公共与本端内容分别派发；若改变已批准的行为或范围，按新流程评审修订。若项目自有的 `docs/agents/issue-tracker.md` 仍约定单文件路径，请在环境会话核对并为新需求改指 `spec/<需求名>/shared.md`，保留历史工单链接。

升级保留项目的 `e2e.enabled`；1.6 及更早的工作区首次升级时沿用原行为（`true`）。要切换，在共同父目录运行 `node $matt update --e2e off` 预览，再加 `--apply`；启用用 `--e2e on`。这会保存选择并按需补齐工具文件，不用重建工作区。关闭不会删除已有用例、登录适配、凭据或报告；再次开启沿用已选工具。`--e2e-provider orca|midscene` 可单独预设或与开关一起使用。旧配置只有 `enabled: true` 的按 Midscene 升级并复用 YAML。若手工编辑 `.matt/workflow.json`，请再运行 `update --apply` 同步对应文件。

从 1.2 或更早版本升级时，`remove-duplicate` 标出与旧清单和上游原文均匹配的 mattpocock 文件。应用后宿主使用已安装的插件。检测到本地改动的 skill 会整体保留，用户可在核对差异后自行整理同名入口。

用可信的**新版上游** CLI，仍在原父目录执行：

```powershell
node $matt update
node $matt update --apply
node $matt update
```

清单 `.matt/manifest.json` 记录工具版本、受管目标和内容 SHA-256（统一换行）。`AGENTS.md` 与 `.gitignore` 仅管理标记段；项目 spec、YAML、workspace、适配和凭据不做版本替换。上游停止管理的文件留在原处。`init` 重跑同样比对，不是强制覆盖。冲突则整批不应用，列出文件、旧/本地/新版摘要和新版模板路径；用本地编辑器对比，或 `git diff --no-index -- <模板> <本地文件>`（有差异时返回 1；只在本地查看，不粘贴含敏感内容的差异）。

- 接受上游：只将对应文件/标记段改成新版模板，再预览应用。保留本地或手工合并：用 `node $matt update --keep '<清单相对路径>'` 预览，然后同参数加 `--apply`。可重复 `--keep`；记录接受的本地摘要，上游再变会再次提示。`.gitignore` 的保护段必须恢复，额外规则可放段外。
- 若进程中断，只在确认 `.matt/install.lock` 记录的安装进程已结束后移除该锁，重新预览；写入逐文件原子替换，清单最后更新。拒绝降级、未知清单格式、目标路径链接及子仓目录碰撞。切勿为消除冲突删除清单。
- 仅在启用 Midscene 时，升级后按第 2 节复用已有模型配置，重新运行 `setup`。旧版 `e2e/cases/environment.yaml` 可能是项目自有文件，升级保留；它仍走业务配置，不作环境自测。

## 故障分流

| 现象 | 下一步 |
|---|---|
| 选错端口/重定向/401 | 核对实际运行环境与 `healthUrl`，不要关闭鉴权或回退 mock。 |
| 缺包、浏览器不存在或 CDN 下载失败 | 核对 Node 版本、网络/企业 CA，重复锁定安装；安装和运行使用同一账号及 Playwright 缓存。 |
| 父层已有 `.env` | Midscene 某些命令会自动读取它，故工具拒绝运行；不要改名或覆盖已有凭据。使用独立干净的消费父目录和该组合的独立测试 checkout，或由项目所有者调整其配置加载方案。 |
| 找不到 case/节点 | 从父目录运行，检查 `e2e/matt.config.mjs` 的 include、`nodes` 清单及 `cases/steps`；旧版 `tasks/flow` 不适用。 |
| 页面跳登录或模型 401 | 分别复核测试 origin、登录状态有效期与模型端点；仅报告哪一步失败，不打印文件或请求头。 |
| 业务失败或只过了 mock | 保留组合版本与私有报告位置，分派对应子仓；等真实前提齐备再复验。 |
