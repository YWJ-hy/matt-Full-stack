# 先固定待审内容，再派两路审查

## 确定仓库和基线

**有派单**：复用本单实际 checkout（可能是独立 worktree）、起始 SHA 和交付依据，不换回默认工作树。

**独立审查**：先从用户请求确定前端、后端或两端，再按共同父目录 `.matt/workspace.json` 的 `frontend.repo` / `backend.repo` 定位 checkout；用户指定工作树时核对它属于选定仓库。缺目标、配置不能唯一对应仓库，或缺比较基线，就只问未确定项。「只审未提交改动」已指定以本端 `HEAD` 为基线。两端都有 `main` 或一端工作树脏，都不能代替用户选择。父目录不是默认审查仓。

对每个目标，用 `git -C "<checkout>" rev-parse --show-toplevel` 确认返回的实际根目录与预期一致，再用 `git -C "<checkout>" rev-parse --verify --end-of-options "<基线ref>^{commit}"` 固定本仓 SHA。ref 不存在或 Git 提示歧义就停止该仓审查，不去另一仓找同名 ref。按分支差异审查时，记录本端待审 HEAD SHA；以 `git -C "<checkout>" merge-base <基线SHA> <待审SHA>` 的结果作**起始 SHA**，保证分支已分叉时补丁和提交审的是同一范围。两端都审就分别固定 checkout、起始 SHA 和待审 HEAD，分别派审、出报告。

## 在已确认的 checkout 选择审查输入

核对 `git status --short --untracked-files=all` 与本单文件清单（独立审查用用户指定的范围）。区分本单与用户原有改动，重命名核对新旧路径。范围不清先问，不为制造可审 diff 而暂存、提交或夹带他人改动。以下二选一。

**提交审查。** 若审查范围是已提交的改动，确认 `git diff <起始SHA>...<待审SHA>` 非空且恰好覆盖该范围，两个 reviewer 的 HEAD 都是这个待审 SHA，再调用 `$mattpocock-skills:code-review`，以起始 SHA 为固定点。若只审其中部分文件，改用 `git diff --binary --no-ext-diff --no-textconv <起始SHA> <待审SHA> -- <限定路径…>` 生成限定范围的补丁，按下方核对、派审；不混入工作树。指定范围没有差异则报告无待审改动。

**补丁审查。** 只要本单还有未提交内容，就交付从起始 SHA 到本次最终文件状态的一份完整补丁，不调用只读 `...HEAD` 的原版入口。在仓库根目录用以下 Git 命令生成，路径换成本单逐一确认的文件，补丁保存在 checkout 外的本地私有位置：

- 已跟踪路径（含删除）：`git diff --binary --no-ext-diff --no-textconv <起始SHA> -- <本单路径…>`。这里刻意不用 `--cached` 或 `...HEAD`，以包含已提交、已暂存及未暂存的最终差异。
- 未跟踪的新文件：逐个追加 `git diff --no-index --binary --no-ext-diff --no-textconv -- /dev/null <新文件>` 的输出；此命令退出 1 表示有差异。只收本单文件，不附私钥、凭据或私有报告。
- 核对 `git apply --stat <补丁>` 与本单清单一致；用干净的基线 checkout 执行 `git apply --check <补丁>` 验证补丁可用，记录补丁摘要。将**同一份补丁**和基线交给两个只读 reviewer；独立 worktree 绑定起始 SHA，审查输入是补丁，不是它的 HEAD diff。无法分离同一文件中的他人改动或拿不到完整补丁，标记审查阻塞。

## 派审和报告

从共同父目录运行 `node .matt/runtime/sessions.mjs standards` 和 `node .matt/runtime/sessions.mjs spec` 取得配置，`repository: implementation` 指本次选定的目标仓。独立审查没有实现会话时，`inherit` 继承发起审查的父会话。两轴使用独立只读上下文、并行审查、分别报告；宿主无法嵌套派审时交父会话代派，已有实现会话仍继承其模型。

两路都传仓库、固定 SHA 或补丁摘要、交付依据和已核实的[工单引用](issues.md)。提交消息里的裸编号不是切换来源的依据。Standards 按本仓规范和 Matt 的代码异味基线，Spec 对照任务单/修复预期与公共契约。独立审查缺依据时询问来源；用户确认没有，则报告「Spec 未审：无依据」，仍可交付 Standards。报告标明仓库、工单（如有）、审查模式与范围；阻塞或未审不报通过。若审后有修改，重新固定最终 SHA 或生成新补丁、复测并复审，不用旧报告签收新改动。
