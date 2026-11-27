# Orca 交接协议

## 任务与回执

“设计验收用例”发生在开发批准前：给 Quality 草案修订、场景 ID、父目录与用例可写范围，请它交回用例和待澄清的业务预期。下述实现单使用获批版本。

Matt 派单与前后端直接接单共用父层 `references/claims.md`。发送前取得 claim；正文携带任务键、claimId、批准范围与回报会话。收件方 start 成功后才允许建树或启动写入 worker。直收者自己执行时使用同一协议；跨端证据交 Matt，原会话负责把结果送达用户。相同任务的阶段和返修按原执行会话定向续接，已有运行先核对回执。

每次只交接一张任务：项目与需求 ID、工单完整引用（如有）、批准的 spec 修订或故障预期、场景 ID、责任仓库、实际 checkout 与起始 SHA、可编辑范围、测试边界、模型解析结果、返回地址。前端只读公共与前端 spec，后端只读公共与后端 spec。完整指南在父目录 `.agents/skills/matt-full-stack/references/`。

需要结果回到派发者时，按当前 `orca-cli` 指南向目标 `bot:<name>` 使用 `--type question`。首次派发用 `--chat new`，续接用 `--chat <原聊天ID>`。正文通过 `--body-file` 传入，子 bot 按消息 ID `reply`。完整所有权交接才用 `handoff`。普通消息送达不表示开工或完成。登记返回的消息 ID；运行时 ID 和进度写入父目录的私有任务记录，最终证据写入本需求 `delivery.md`。

主控管理需求范围和跨端契约，各 bot 管理自己启动的 worker。加载 Orca 当前的 `orchestration` 指南后启动受监督任务，保留 Run/Task/Dispatch 标识。根据回执的 `next` 行动；等待时结束本轮，让 Orca 唤醒。发生失败或结果不明时按回执恢复，保留原请求，避免重复派单。

## 隔离与审查

实现 worker 按角色的 `worktree` 配置运行。启用时由 Orca 从本任务的 startSha 创建并绑定，使用 `--setup inherit`。分别核对最终目标、仓库身份、HEAD 与初始化结果；详见父层 `references/worktrees.md`。独立任务各有自己的任务分支。共享 checkout 时同仓的写入任务串行执行。

Quality 按父层 `references/review.md` 固定提交或完整补丁；Standards 与 Spec 使用独立只读上下文，分别报告。先固定本次输入，再审查；修改后重新固定版本并复审。实现上下文不充当自己的 reviewer。

## 完成条件

交回需求/修订/场景、最终 SHA 或补丁摘要、测试命令及结果、实际模型和目录、两轴审查、启动迁移条件、未验证项与阻塞。主控按项目 `e2e.enabled` 决定真实组合验收；仅开发模式明确未执行 E2E。需求获批不等于合回获批，任务工作树的收尾按父层规则处理。

长期偏好和稳定项目知识可以进入 bot 记忆；本单批准修订、运行版本和验收证据以项目文件与实际回执为准。
