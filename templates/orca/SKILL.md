---
name: matt-orca
description: 在 Orca bot 团队中处理 Matt 项目的需求、分端开发、独立审查、验收或团队就绪检查。
---

读取本 skill 的 `project.json`，其中 `workspaceRoot` 是消费项目的共同父目录，`role` 是本 bot 的职责，`installer` 是工具包入口。读取父目录的 `CLAUDE.md`（没有则 `AGENTS.md`）及 Agent skills 约定，再按 [本角色步骤](role.md) 工作。任务交接遵循 [Orca 交接协议](references/protocol.md)。

## 先检查安装

从自己的 bot home 执行 `node <installer> doctor --workspace <workspaceRoot>`。缺少本 bot 的登记时，从同一目录执行 `apply`；已有未解决的文件冲突或项目映射错误时交回具体缺项。仅缺其他 bot 时可继续本端只读检查，派单等待目标就绪。

用户要求就绪检查时，报告本 bot 的角色、实际 home、父目录、责任仓库、可读规格入口和模型策略。就绪检查的完成依据是配置和资料可读；业务开发需要具体需求及其相应授权。

## 模型选择

派单角色使用父目录的 `node .matt/runtime/sessions.mjs <frontend|backend|standards|spec> --host orca`。任务另有模型时追加 `--model <模型或别名>`；该次设置优先于角色配置。输出 `model: null`、`modelSource: bot-default` 表示使用**接单 bot 自身的默认模型**。旧配置 `inherit` 在 Orca 中按此解释。

Standards 和 Spec 的接单 bot 都是 Quality。主控与其他 bot 的模型不参与默认值选择。本协议的模型规则替代通用 Matt 指南和随包 skill 中的模型继承约定。

Bot 间消息没有模型切换参数：显式模型随任务交给接单 bot，由它启动指定模型的独立执行或审查会话。默认模式先使用该 bot 的新会话；需要 worker 时，核实接单 bot 自身的默认模型并显式传给 worker。`worker-start` 省略 `--model` 只能保证使用 agent 的默认值，不能证明等于 bot 的默认模型。公开接口无法核实该值时，报告待派并请用户在该 bot 中确认，不借用主控模型、不静默改用全局默认。记录实际模型和来源。
