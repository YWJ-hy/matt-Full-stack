---
name: matt-orca
description: 在 Orca bot 团队中处理 Matt 项目的需求、分端开发、独立审查、验收或团队就绪检查。
---

读取本 skill 的 `project.json`，其中 `workspaceRoot` 是消费项目的共同父目录，`role` 是本 bot 的职责，`installer` 是工具包入口。从 `workspaceRoot` 运行 `node .matt/runtime/docs.mjs`，核对输出与 `project.json` 的 `documents`。用解析出的 `agentDocs` 和 `specs` 访问同一份工程约定、需求、用例和交接，即使 worker 在另一仓库的工作树中也使用这些绝对路径。旧父目录布局按 `CLAUDE.md`（没有则 `AGENTS.md`）的 Agent skills 约定，再按 [本角色步骤](role.md) 工作。任务交接遵循 [Orca 交接协议](references/protocol.md)。

## 先检查安装

从自己的 bot home 执行 `node <installer> doctor --workspace <workspaceRoot>`。缺少本 bot 的登记时，从同一目录执行 `apply`；已有未解决的文件冲突或项目映射错误时交回具体缺项。仅缺其他 bot 时可继续本端只读检查，派单等待目标就绪。

用户要求就绪检查时，报告本 bot 的角色、实际 home、父目录、责任仓库、可读规格入口和模型策略。就绪检查的完成依据是配置和资料可读；业务开发需要具体需求及其相应授权。

## 模型选择

架构调查、前后端实现和 Quality 两轴审查从父目录运行 `node .matt/runtime/sessions.mjs <architect|frontend|backend|standards|spec> --host orca`。若任务指定模型，追加 `--model <模型或别名>`。接单方在 worker-start 参数中展开返回的 `workerModelArgs`。具体模型对应 `--model <模型>`。结果为 `model: null`、`modelSource: bot-default` 时，直接省略 `--model` 启动 worker，登记来源为默认。旧配置 `inherit` 在 Orca 中也这样处理。架构师默认在自己的 bot 会话分析，调查 worker 同样遵守默认省略、显式传入的规则。
