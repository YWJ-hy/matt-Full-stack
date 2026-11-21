# AI 实施手册

首次接入或升级在共同父目录单开环境会话，只验证 **浏览器 → 项目技术栈的测试前端 → HTTP → 内存测试后端**。已有业务和全新项目走同一条隔离路径。第 2 节通过或记录阻塞后结束会话；登录、真实业务服务和业务用例留给需求会话。

**体验项目：** `examples/create-workspace.mjs` 已安装工具包，并在两端的 `selftest/` 中备好 Vite 和 Express 夹具。从第 2 节开始，无需启动工单应用。通过后在同一父目录新开需求会话：`$matt-full-stack 实现 REQUIREMENT.md 中的「客服领取工单」。`

## 1. 确认边界，预览再安装

在**消费父目录**启动终端；定位包含本手册和 `bin/matt.mjs` 的本地工具包。下例是 PowerShell（Windows 用 `npm.cmd`，其余平台用 `npm`）：

```powershell
$matt = 'C:\path\to\matt-full-stack\bin\matt.mjs' # 替换成发现的绝对路径
node --version
node $matt discover
node $matt init
node $matt init --apply
node $matt init
```

使用 Node 22.12+ 的受支持 LTS 版本。上游独立保存；不需要发布 npm 包或把下游变为 monorepo。可用 `--workspace <父目录>` 显式指定目标。首次完成以末次输出 `changes=0` 为准。父目录不必有 `.git`；不自动建立、嵌套或提交 Git 仓库。已有子仓的安装、调试、提交仍按各自指令执行。

`discover` 只看直接下属 Git 仓库（含 worktree）、根级包/锁/启动脚本及 README 的本地地址；输出是**候选**。只读核对技术栈和仓库指令，不搜索 `.env`、浏览器配置或历史凭据。`.matt/workspace.json` 的 URL 和启动命令留给业务验收，初始化时不访问、不执行，也不改写为夹具地址。已有两个空 Git 仓但技术栈尚未选定时，先请用户确认两端选型，不用示例栈代替。

## 2. 在父目录准备运行环境

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
node .matt/runtime/run.mjs selftest 4273 4274  # 示例：实际的前端、后端夹具端口
```

`selftest` 使用自己的 Midscene YAML `ENV-01` 和全新 Chromium 上下文。每次用新的 UUID 从后端取期望标记，再打开前端测试页核对显示值；不使用业务登录钩子、用例、模型或健康地址。记录两端测试入口、启动命令与报告位置（`.matt/reports/selftest-*/`），只停止本次启动的进程。通过只表示「项目技术栈下的 E2E 链路已跑通；未连接数据库，未验证业务功能」。失败就报告阻塞，不以两个 HTTP 200 代替。

## 3. 业务验收时再配置登录与模型

先检查父层 `.gitignore` 受管段有效。父目录有 Git 时，先用 `git check-ignore .matt/private/model.env .matt/private/state.json .matt/reports/sample`，并用 `git ls-files -- .matt/private .matt/reports midscene_run e2e/midscene_run` 核实没有已跟踪的敏感文件；没有父 Git 时仍落实本机用户级权限。报告可能含页面、Cookie 相关错误或截图，视同敏感数据。不复制真实数据，不上传报告。私有目录仅授权当前测试用户；CI 从 Secret Store 临时落盘并按环境策略销毁。

```powershell
New-Item -ItemType Directory -Force .matt/private | Out-Null
if (!(Test-Path .matt/private/model.env)) { Copy-Item .matt/model.env.example .matt/private/model.env }
```

- **登录：** 读项目现有登录实现，选择授权的测试租户/最小权限账号。Cookie 或 localStorage 会话可在本机专用测试浏览器中交互登录：`node .matt/runtime/node_modules/playwright/cli.js open --browser chromium --save-storage=.matt/private/state.json <实际测试前端URL>`，用户登录后关闭窗口。将 `e2e/login.mjs` 的 `session` 设为 `{ storageState: '.matt/private/state.json' }`。sessionStorage、测试 token、API 换票或 SSO 请用项目自有机制实现 `prepare({ page, context, workspace })`，只对已核实的测试 origin 注入；不要将业务凭据写入模型文件、YAML、提示词或公共 spec。此 hook 每个 YAML 文件启动一次，同一文件内的 case 共用页面；独立角色分文件，或显式复位。
- **模型：** 只有 `aiAct`、`aiAssert` 等视觉节点需要模型。由用户在本地私密编辑器/密钥管理器填写 `.matt/private/model.env`；T3 中需要代收时用安全的 `request_secret` 文件交付，不要请求聊天粘贴或回显。填写服务商视觉模型 endpoint、name、匹配的 family 与 API key。仅 `model` / `test` 子进程读取此文件；运行器不会继承 shell 的模型变量，Chromium 进程不传模型配置。经允许向相应模型发送测试页面、产生费用后再执行 `node .matt/runtime/run.mjs model`。未提供密钥时继续确定性冒烟，将视觉步骤标为未验证。
- **业务用例：** 查前端路由表、权限守卫、请求封装和后端 handler，核实入口和读回点；父会话维护 `e2e/cases/*.yaml`，不让用户逐页报 URL。例（按真实契约替换），这不是可直接宣布通过的验收项：

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
```

命令输出可供任意会话工具读取的 JSON。派发者使用宿主实际提供的模型选择、工作目录、工作树及权限机制，并按派单模板回报结果。只能手动开会话的工具也可以使用同一份输出开会话并粘贴派单。模型不可用或无法满足隔离时标记待派发，由使用者选择合适的工具或调整配置。

### 选择父会话工作流

在共同父目录调用 `$matt-full-stack`，说明需要什么交付物即可。例如：

- 「只调研工单并发领取方案，不改产品代码。」父会话交付调研结论，不派实现单。若宿主缺少 `research` 且工具包无本地参考，说明缺失并停止。
- 「只修后端，按已确认的契约返回 409。」只向后端派 `implement`，沿用 TDD 和审查流程；联调可使用未改动的前端版本。
- 「只验收当前版本的领取工单场景。」直接核对版本、运行已有 case 并报告结果；失败也不自动派修复。

### 执行验收

父会话执行 `.agents/skills/matt-full-stack/SKILL.md`。此时才核实 `.matt/workspace.json` 的业务测试地址与版本，启动授权的测试服务；`doctor` 检查这两个地址和 Chromium，`nodes` 生成编写 YAML 用的节点清单。单文件运行 `node .matt/runtime/run.mjs test e2e/cases/<场景>.yaml`，全量运行 `node .matt/runtime/run.mjs test`。以退出码、原生 summary/HTML、具体 case 与预期对应关系为证据。`.matt/reports/<运行ID>/receipt.json` 记录本地 checkout SHA 和 dirty 状态；**不是**已部署版本证明。核对服务构建标识或启动记录、真实账号/后端与合成数据，记录在 `spec/<需求>.md`；任何缺项标为未验证/阻塞。工具返回零不自动签收。注意数据清理、测试幂等和不同角色隔离。

## 5. 升级与冲突

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
- 锁或运行器更新后重复第 2 节的锁定安装与隔离自测。旧版 `e2e/cases/environment.yaml` 可能是项目自有文件，升级保留；它仍走业务配置，不作环境自测。

## 故障分流

| 现象 | 下一步 |
|---|---|
| 选错端口/重定向/401 | 核对实际运行环境与 `healthUrl`，不要关闭鉴权或回退 mock。 |
| 缺包、浏览器不存在或 CDN 下载失败 | 核对 Node 版本、网络/企业 CA，重复锁定安装；安装和运行使用同一账号及 Playwright 缓存。 |
| 父层已有 `.env` | Midscene 某些命令会自动读取它，故工具拒绝运行；不要改名或覆盖已有凭据。使用独立干净的消费父目录和该组合的独立测试 checkout，或由项目所有者调整其配置加载方案。 |
| 找不到 case/节点 | 从父目录运行，检查 `e2e/matt.config.mjs` 的 include、`nodes` 清单及 `cases/steps`；旧版 `tasks/flow` 不适用。 |
| 页面跳登录或模型 401 | 分别复核测试 origin、登录状态有效期与模型端点；仅报告哪一步失败，不打印文件或请求头。 |
| 业务失败或只过了 mock | 保留组合版本与私有报告位置，分派对应子仓；等真实前提齐备再复验。 |
