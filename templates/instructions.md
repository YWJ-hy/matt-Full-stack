首次接入或升级时，在共同父目录的环境会话按 `.matt/AI_SETUP.md` 安装工具并核对 Matt 共享工程约定。

从共同父目录运行 `node .matt/runtime/docs.mjs`，取得工程约定目录 `agentDocs` 和需求规格目录 `specs`。

- **工单约定**　接收或交接需求时，读 `agentDocs` 下的 `issue-tracker.md`，确认是否需要建单、去哪里查单，以及前后端应传递哪个工单引用。
- **领域文档**　澄清业务含义或核对已有设计决策时，读 `agentDocs` 下的 `domain.md`，按其中的约定查找团队术语表和相关架构决策记录。
- **需求规格**　在 `specs` 下按需求维护可独立使用的规格。需求根目录的 shared.md 和 tasks.md 记录问题、目标、共用规则、任务依赖及调度进展。单项直接用根目录，拆分时每个 task 目录独立维护任务、接口、验收用例及交付结果。外部需求包只作来源记录。

日常需求在同一父目录用 `$matt-full-stack` 加需求描述，按 `.agents/skills/matt-full-stack/SKILL.md` 派单。子仓实现遵循各自指令。切换 E2E 按环境手册操作。`.matt/workflow.json` 的 `e2e.enabled` 控制浏览器验收，`e2e.provider` 决定用 Orca 原生浏览器还是 Midscene 执行开发前确定的用例。
