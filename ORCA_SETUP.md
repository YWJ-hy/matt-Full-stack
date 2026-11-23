# 安装 Orca bot 团队

本仓库是工具包；`--workspace` 始终指向前后端两个 Git 仓库的共同父目录。第一版安装到本机 Orca，一组项目对应 Matt、Frontend、Backend、Quality 四个 bot。项目约定、spec、交付和 E2E 开关继续保存在消费父目录。

## 1. 准备与预览

需要 Node 22.12+、Git，以及正在运行、支持 `bot create --offer` 的 Orca。安装器使用 `ORCA_CLI_COMMAND` 指定的可执行文件；开发环境使用 `orca-dev`，其他 Linux 环境使用 `orca-ide`，其余平台使用 `orca`。调用固定到本机，不跟随环境中的远程服务器选择。

先按 `AI_SETUP.md` 初始化消费工作区并完成父层共享工程约定。旧工作区先执行工具包的 `matt update --apply`，使会话解析器支持 Orca 模式。然后在本工具包根目录运行：

```powershell
node bin/matt-orca.mjs plan --workspace 'D:\projects\ticket'
node bin/matt-orca.mjs apply --workspace 'D:\projects\ticket'
```

`plan` 只读，不创建文件或 bot。首次 `apply` 保存项目配置、注册缺失的本机 Orca 前后端项目，并生成 `.matt/private/orca-bootstrap.md`。普通终端没有 bot 会话身份，因此这一步会报告待创建及退出码 2，属于可继续的安装状态。

配置 `.matt/orca.json` 由项目维护，示例：

```json
{
  "version": 1,
  "projectId": "ticket",
  "bots": {
    "matt": "ticket-matt",
    "frontend": "ticket-frontend",
    "backend": "ticket-backend",
    "quality": "ticket-quality"
  },
  "repos": {
    "frontend": null,
    "backend": null
  }
}
```

自动名称带项目路径的短摘要，以区分同名目录。需要自定义时，在创建 bot 前编辑配置：`projectId` 使用至多 24 字符的小写字母、数字、连字符；bot 名字使用同样字符集，最长 40 字符且彼此不同。`repos` 的 `null` 表示按 `.matt/workspace.json` 的实际仓库路径发现；多个 Orca 项目指向同一目录时，填从 `orca repo list --json` 核实的 `id:<项目ID>`。配置不包含模型、密钥或连接器登录。

## 2. 创建与登记

1. 按预览输出的**准确名字**在 Orca 中创建主控 bot。
2. 在主控会话发送 `.matt/private/orca-bootstrap.md` 的启动说明。让它从自己的 bot home 执行说明中的绝对路径安装命令。安装器根据 `orca bot list` 的 `self` 标识登记调用者，并为另外三个缺失 bot 提出创建卡片。
3. 接受创建卡片。每个 bot 都要在自己的会话中，从自己的 home 执行一次同一条 `apply` 命令。卡片说明包含该命令；可直接让 bot 按说明完成登记。
4. 所有 bot 登记后，从普通终端或主控会话运行 `doctor`。

Bot home 是 Orca 创建的 `~/.orca/bots/` 下的实际目录。安装器不会根据显示名猜目录，也不通过建文件夹冒充创建 bot。首次登记要求调用者的 `self` 身份与项目角色匹配，当前目录是实际 bot home；后续升级使用已登记的 ID、目录和身份文件。

Orca 官方 `bot create --offer` 只提出卡片，接受后才创建。创建卡片的回执不代表安装完成。已提出的卡片不会在下一次 `apply` 重复提出；结果不明时先核对 Orca 中的卡片和 bot 列表。

## 3. 校验与使用

```powershell
node bin/matt-orca.mjs doctor --workspace 'D:\projects\ticket'
node bin/matt-orca.mjs plan --workspace 'D:\projects\ticket' --json
```

`doctor` 校验项目映射、角色会话配置、bot 绑定和受管文件。退出码：

| 退出码 | 含义 |
|---|---|
| 0 | `plan` 无冲突；或 `apply / doctor` 已就绪 |
| 1 | 配置错误、文件冲突或 Orca 调用失败 |
| 2 | `apply / doctor` 还有待创建、待登记、待同步、已暂停或共享约定缺失等事项 |

静态就绪后，让四个 bot 分别做一次「团队就绪检查」，报告实际项目、职责、资料入口与模型策略。最后向 Matt 发一张具体需求：澄清与批准 spec → 前后端独立实现 → Quality 的两轴审查 → 按项目开关验收 → 汇总交付和合回决定。只有具体需求已获开发授权时才派实现；安装不会启动产品开发。

当前安装器同步角色说明、工作流和各角色需要的随包 Matt skills。外部连接器和事件自动化属于后续接入；已有 bot 的个人记忆、连接和默认模型由 Orca 维护。

## 4. 模型规则

从消费父目录执行：

```powershell
node .matt/runtime/sessions.mjs frontend --host orca
node .matt/runtime/sessions.mjs frontend --host orca --model '@coding'
node .matt/runtime/sessions.mjs spec --host orca --model 'bot-default'
```

优先级为：**本次 `--model` → `.matt/sessions.json` 对应角色的显式模型 → 接单 bot 自身默认模型**。别名仍由 `.matt/private/models.json` 或 `--models <文件>` 解析，无法解析就报错。

省略 model、旧配置中的 `inherit`，以及显式 `bot-default`，在 Orca 模式均输出 `model: null`、`modelSource: "bot-default"`。前端和后端各用自己的默认模型；Standards、Spec 使用接单的 Quality bot 默认模型，不继承实现 bot 或主控。其他宿主省略 `--host orca` 后保留原来的跨工具行为。

Orca 的 bot 消息接口没有模型覆盖参数，因此显式模型随任务传给接单 bot，由它在独立执行/审查会话中使用。默认模式用该 bot 的新会话。派生 worker 时，要核实这个 bot 自身的默认模型并传给 worker：省略 `worker-start --model` 可能使用 agent 的全局默认，不能作为 bot 默认模型的证明。目前公开 bot 列表不提供默认模型字段，无法核实时由该 bot 请用户确认；安装器保留这一待解析状态，不猜测或切换模型。

## 5. 升级与恢复

更新工具包后，先更新消费工作区工具，再运行 `plan → apply → doctor`。已登记团队的配置文件升级可从普通终端进行；提出新 bot 卡片仍须主控会话。

- `.matt/private/orca-install.json` 保存 bot ID、实际 home、受管文件摘要和卡片状态；每个 bot home 的 `.matt-orca.json` 标识其项目与角色。
- `SOUL.md` 只更新 `matt-orca` 标记段，段外内容与 `MEMORY.md` 保留。技能文件按上次安装摘要更新；本地修改冲突时整批文件同步停止。将项目偏好放在 SOUL 标记段之外；`plan --json` 的 `conflicts[].proposed` 给出新版内容，`scope: section` 表示仅替换标记段，`file` 表示完整文件。接受新版后重新预览。
- 已停止管理的旧文件保留；清单不再把它们当作当前模板。安装器不会清理工作树、自动合并或删除 bot。
- 同名 bot 被重建或改名，目录被移走、身份标记缺失或指向其他项目时停止。先核对真实身份并恢复相符的配置/绑定，不能仅凭同名接管。
- 卡片被拒绝而你决定重新提出：先核对该 bot 确实未创建，再只移除安装清单 `offers` 中该角色的记录，从主控会话重新 `apply`。`unknown` 表示调用结果不明，先核对原卡片；脚本不自动重发。
- 安装用 `.matt/private/orca-install.lock` 防止并发写入。进程中断后，仅在确认锁中 PID 已结束时移除该锁，再重新预览。逐文件采用原子替换，已经完成的相同内容可在重跑时复用。

安装记录仅支持本机；复制消费项目到另一台机器时重新绑定该机器的 bot，不复制私有安装状态。`plan` 和 `doctor` 都不会启动 worker、发消息或运行 E2E。
