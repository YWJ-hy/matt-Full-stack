# 安装 Orca bot 团队

在能访问本机项目和终端的 AI 会话中输入：

> 按照文档 ORCA_SETUP.md 配置好环境

收到这句话后，AI 按下列步骤完成本机安装。新工作区直接采用团队默认值：前端和后端各用独立 worktree，使用默认模型时派单省略 `--model`，E2E 关闭，执行工具预设为 Orca 原生浏览器。安装结束时汇报这些设置，无需逐项询问。有明确的项目配置或用户给出的覆盖值时沿用实际选择。

## 1. 准备与预览

需要 Node 22.12+、Git，以及正在运行、支持 `bot create --offer` 的 Orca。安装器使用 `ORCA_CLI_COMMAND` 指定的可执行文件；开发环境使用 `orca-dev`，其他 Linux 环境使用 `orca-ide`，其余平台使用 `orca`。调用固定到本机，不跟随环境中的远程服务器选择。

先从当前会话的项目路径和已有 `.matt/workspace.json` 定位两个业务 Git 仓的共同父目录。找不到或有多个候选时，只问共同父目录或两个仓的路径。从工具包根目录运行以下 PowerShell 命令，将示例路径换成本机实际路径。AI 核对每次预览后直接继续。

```powershell
$project = 'D:\projects\ticket'
node bin/matt.mjs discover --workspace "$project"
node bin/matt.mjs docs --workspace "$project"
```

先核对前后端映射。角色不唯一时，根据用户确认的两个直接子仓补齐父目录 `.matt/workspace.json`，再运行 `docs`。此命令只读检查父目录和两个已映射仓的根目录。

| 文档发现结果 | AI 的下一步 |
|---|---|
| `configured` | 复用输出的 `agentDocs` 和 `specs`。即使 `specs` 还没有需求，也沿用选定位置。 |
| `ambiguous` | 列出含 `.matt-docs.json` 的实际仓库和路径。用户选定后用 `docs --owner <角色> --apply` 保存本机选择。 |
| `unconfigured` | 阅读候选位置的 CLAUDE.md、AGENTS.md 和其链接。若已有明确的共享文档约定，按下文用 `--local` 记下已有路径。同名目录仅作线索，例如后端的 `spec/` 可能是测试。仍有歧义就列出候选请用户选一次。 |

全新团队若有团队管理的父目录 Git 仓，默认选择 `parent`。父目录无仓且没有明确约定时，只问「共享工程约定和需求规格放在前端仓、后端仓，还是仅在本机父目录试用？」选前端用 `frontend`，选后端用 `backend`，仅本机试用用 `--owner parent --local`。例如团队首次选后端，AI 执行以下两条：

```powershell
node bin/matt.mjs docs --workspace "$project" --owner backend
node bin/matt.mjs docs --workspace "$project" --owner backend --apply
```

这会在后端仓根目录创建可随项目提交的 `.matt-docs.json`，内容如 `{"version":1,"agentDocs":"docs/agents","specs":"spec"}`。两个目录相对配置文件位置，创建配置无需提前生成规格目录。首次接入时把待共享的配置和新增约定列给用户。新成员克隆已有配置后直接使用；本机安装状态由工具写入共同父目录。

旧项目已在项目说明中明确位置时，例如「约定在后端的 handbook/agents，规格在前端的 requirements」，用 `docs --owner parent --local --agent-docs <后端仓名>/handbook/agents --specs <前端仓名>/requirements --apply` 记录路径。两者同仓时也可选相应角色并使用仓内相对路径。已有文档直接复用，迁移文件单独处理。

在解析出的 `agentDocs` 核对 `issue-tracker.md` 与 `domain.md`。首次建立约定时，在当前会话确认工单和领域文档位置后写入。新同事接入已有配置时，若约定缺失，先指出缺失文件、核对分支或路径；避免用新文件覆盖团队约定。用户点名原版 setup skill 时按 [AI_SETUP.md](AI_SETUP.md) 的显式调用步骤执行。

文档位置就绪后继续安装：

```powershell
$operation = if (Test-Path (Join-Path $project '.matt/manifest.json')) { 'update' } else { 'init' }
node bin/matt.mjs $operation --host orca --workspace "$project"
node bin/matt.mjs $operation --host orca --workspace "$project" --apply
```

初始化会把查找共享文档的命令写入父目录 `AGENTS.md` 的受管段。从任何 checkout 发起任务，都按这条说明从共同父目录运行 `node .matt/runtime/docs.mjs`（或调用该脚本的绝对路径），使用本次返回的 `agentDocs` 和 `specs`。具体路径在安装结果中汇报。项目自有模板可放在 `<specs>/_templates/`，没有对应模板时使用本机的 `fallbackTemplates`。第一份需求起草时才创建需求目录。

使用 Orca 原生浏览器验收时，用例保存在 `<specs>/<需求名>/acceptance.md`，可以随需求规格提交。Midscene 从共同父目录的 `e2e/cases/` 读取 YAML，这个目录独立于 `.matt-docs.json` 的 `specs` 配置。如果只有前后端子仓受 Git 管理，同事克隆子仓后还需另行取得这些 YAML。

```powershell
node bin/matt-orca.mjs plan --workspace "$project"
node bin/matt-orca.mjs apply --workspace "$project"
```

`plan` 只读，不创建文件或 bot。首次 `apply` 保存项目配置、注册缺失的本机 Orca 前后端项目，并在命令回执的 `bootstrap` 中给出登记说明。普通终端没有 bot 会话身份，因此这一步会报告待创建及退出码 2，属于可继续的安装状态。

配置 `.matt/orca.json` 由项目维护，示例：

```json
{
  "version": 1,
  "projectId": "ticket",
  "bots": {
    "matt": "ticket-matt",
    "frontend": "ticket-frontend",
    "backend": "ticket-backend",
    "quality": "ticket-quality",
    "architect": "ticket-architect"
  },
  "repos": {
    "frontend": null,
    "backend": null
  }
}
```

自动名称带项目路径的短摘要，以区分同名目录。需要自定义时，在创建 bot 前编辑配置：`projectId` 使用至多 24 字符的小写字母、数字、连字符；bot 名字使用同样字符集，最长 40 字符且彼此不同。`repos` 的 `null` 表示按 `.matt/workspace.json` 的实际仓库路径发现；多个 Orca 项目指向同一目录时，填从 `orca repo list --json` 核实的 `id:<项目ID>`。配置不包含模型、密钥或连接器登录。

## 2. 创建与登记

### PostgreSQL 查表和开发库变更

首次运行 Orca 安装器的 `apply` 会在共同父目录创建 `.matt/private/database.json`。该目录由父目录的 Git 忽略规则覆盖。文件初始内容如下。

```json
{
  "version": 1,
  "connectionString": "",
  "qualityTestConnectionString": "",
  "developmentWriteConnectionString": ""
}
```

在本机把只读账号的 PostgreSQL URL 填入 `connectionString` 即可为 Matt 和后端启用查表。格式为 `postgresql://user:password@host:5432/database`，账号和密码中的特殊字符按 URL 编码。需要 Quality 核对测试库结构时，单独填写 `qualityTestConnectionString`。前端使用公共契约。

运行 `node bin/matt-orca.mjs apply --workspace "$project"`。安装器按锁文件安装 MCP 依赖，给已登记的对应 bot 绑定 `matt_db_schema`；新 bot 在登记时补绑。老工作区先执行 `node bin/matt.mjs update --host orca --workspace "$project" --apply`。清空对应连接并再次运行 Orca 安装器会撤下该角色的绑定。更换密码后，下次调用自动读取新值。

`doctor --json` 的 `database` 显示角色、绑定状态和开发库写入开关。新开 bot 聊天，调用 `list_tables(limit=1)`，再用返回的 schema 和表名调用 `describe_table`。这两项工具始终使用只读事务。独立 worker 缺少工具时，由派发 bot 查表并交回结果。

需要 Backend 执行开发 SQL 时，在私有配置填入 `developmentWriteConnectionString` 后运行上述安装步骤，并新开 Matt 和 Backend 聊天。旧配置可继续只读使用。写连接必须指向已确认的开发库，包含明确的账号、主机和库名，可指定端口和 `sslmode`。项目确认复用已有连接时可以填入同一 URL。保持真实密码只在本机私有配置内。

Backend 在开发阶段准备 `<specs>/<需求名>/delivery-sql/<文件名>.sql`。Matt 在主会话调用 `confirm_dev_sql`，优先使用 MCP 人工确认表单，Windows 客户端未提供表单时显示本机确认窗口。本人核对目标、内容及影响并明确同意后，Backend 用 `apply_dev_sql` 执行一次。拒绝或取消没有批准编号。脚本、位置或连接变化需要重新确认。回执保存在父目录私有目录内，中断可用同一编号查询结果。此确认约束工作流的 MCP 入口，本机文件和数据库账号由操作系统用户管理。

Matt 保持真实的 `delivery.md` 与 `delivery-sql/` 同级，用相对链接记录脚本用途、SHA-256 和执行结果，随该需求 spec 一起提交。Quality 验证业务行为，各需求 SQL 供迭代结束时编制完整上线脚本参考，上线由运维平台执行。

### 登记团队

1. 已有对应主控 bot 时直接进入其聊天。首次创建时，告诉用户预览输出的**准确名字**及在 Orca 中需要执行的操作。
2. 在主控会话发送 安装命令回执 `bootstrap` 中的启动说明。让它从自己的 bot home 执行说明中的绝对路径安装命令。安装器根据 `orca bot list` 的 `self` 标识登记调用者，并为其余缺失的团队 bot 提出创建卡片。
3. 接受创建卡片。每个 bot 都要在自己的会话中，从自己的 home 执行一次同一条 `apply` 命令。卡片说明包含该命令；可直接让 bot 按说明完成登记。
4. 所有 bot 登记后，从普通终端或主控会话运行 `doctor`。

Bot home 是 Orca 创建的 `~/.orca/bots/` 下的实际目录。安装器不会根据显示名猜目录，也不通过建文件夹冒充创建 bot。首次登记要求调用者的 `self` 身份与项目角色匹配，当前目录是实际 bot home；后续升级使用已登记的 ID、目录和身份文件。

Orca 官方 `bot create --offer` 只提出卡片，接受后才创建。创建卡片的回执不代表安装完成。已提出的卡片不会在下一次 `apply` 重复提出；结果不明时先核对 Orca 中的卡片和 bot 列表。

## 3. 校验与使用

```powershell
node bin/matt-orca.mjs doctor --workspace "$project" --json
node bin/matt-orca.mjs plan --workspace "$project" --json
```

`doctor` 校验项目映射、角色会话配置、bot 绑定和受管文件。退出码：

| 退出码 | 含义 |
|---|---|
| 0 | `plan` 无冲突；或 `apply / doctor` 已就绪 |
| 1 | 配置错误、文件冲突或 Orca 调用失败 |
| 2 | `apply / doctor` 还有待创建、待登记、待同步、已暂停或共享约定缺失等事项 |

当 `doctor.status` 为 `ready` 且二次预览的 `changes`、`conflicts`、`pending` 均为空，在**发起安装的会话**总结：项目父目录、前后端仓库、documents.agentDocs 与 documents.specs 的实际路径、五个 bot 的实际名称与绑定状态、前后端各自的 worktree 设置、模型来源，以及 E2E 开关和预设执行工具。从 `doctor --json` 的 `sessions`、`e2e`、`e2eProvider` 读取实际值。示例结论为「五个 bot 已就绪。前后端各用独立工作树；默认 worker 省略模型参数；E2E 已关闭，预设 Orca 原生浏览器。」有待处理项时说明具体角色和所需操作，完成后继续校验。

当前安装器同步角色说明、工作流和各角色需要的随包 Matt skills。外部连接器和事件自动化属于后续接入；已有 bot 的个人记忆、连接和默认模型由 Orca 维护。

需求包交 Matt 后可以在同一次规格评审只批准部分业务子任务。直接在前端或后端聊天提出本端修复时，该 bot 查询相同的任务记录，复用已有执行者及工作树，向原聊天回报。项目父目录的 `node .matt/runtime/tasks.mjs list` 可查看两个入口的记录。只有联调条件未满足的项仍可开发。工作树由 Orca 按仓库配置初始化；合回与清理根据试合并证据和用户授权执行。

## 4. 模型规则

从消费父目录执行：

```powershell
node .matt/runtime/sessions.mjs frontend --host orca
node .matt/runtime/sessions.mjs frontend --host orca --model '@coding'
node .matt/runtime/sessions.mjs spec --host orca --model 'bot-default'
```

优先级为：**本次 `--model` → `.matt/sessions.json` 对应角色的显式模型 → 省略 worker 模型参数**。别名仍由 `.matt/private/models.json` 或 `--models <文件>` 解析，无法解析就报错。

省略 model、旧配置中的 `inherit`，以及显式 `bot-default`，在 Orca 模式均输出 `model: null`、`modelSource: "bot-default"`。模型参数直接取解析结果的 `workerModelArgs`。Standards、Spec 均由 Quality 接单。其他宿主省略 `--host orca` 后保留原来的跨工具行为。

Orca 的 bot 消息接口没有模型覆盖参数，因此显式模型随任务传给接单 bot，由它在独立执行/审查会话中使用。workerModelArgs 为空时直接启动 worker，记录来源为默认。

## 5. 升级与恢复

更新工具包后，先更新消费工作区工具，再运行 `plan → apply → doctor`。已登记团队的配置文件升级可从普通终端进行；提出新 bot 卡片仍须主控会话。

- `.matt/private/orca-install.json` 保存 bot ID、实际 home、受管文件摘要和卡片状态；每个 bot home 的 `.matt-orca.json` 标识其项目与角色。
- `SOUL.md` 只更新 `matt-orca` 标记段，段外内容与 `MEMORY.md` 保留。技能文件按上次安装摘要更新；本地修改冲突时整批文件同步停止。将项目偏好放在 SOUL 标记段之外；`plan --json` 的 `conflicts[].proposed` 给出新版内容，`scope: section` 表示仅替换标记段，`file` 表示完整文件。接受新版后重新预览。
- 已停止管理的旧文件保留；清单不再把它们当作当前模板。安装器不会清理工作树、自动合并或删除 bot。
- 同名 bot 被重建或改名，目录被移走、身份标记缺失或指向其他项目时停止。先核对真实身份并恢复相符的配置/绑定，不能仅凭同名接管。
- 卡片被拒绝而你决定重新提出：先核对该 bot 确实未创建，再只移除安装清单 `offers` 中该角色的记录，从主控会话重新 `apply`。`unknown` 表示调用结果不明，先核对原卡片；脚本不自动重发。
- 安装用 `.matt/private/orca-install.lock` 防止并发写入。进程中断后，仅在确认锁中 PID 已结束时移除该锁，再重新预览。逐文件采用原子替换，已经完成的相同内容可在重跑时复用。

安装记录仅支持本机；复制消费项目到另一台机器时重新绑定该机器的 bot，不复制私有安装状态。`plan` 和 `doctor` 都不会启动 worker、发消息或运行 E2E。
