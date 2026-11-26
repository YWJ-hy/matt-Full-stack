<img src="assets/icon.svg" width="64" height="64" alt="">

# matt-Full-stack

按同一份需求和接口契约向两个独立项目派单，按项目选择是否做浏览器验收。工具装在**共同父目录**，不接管子仓。

**首次接入**：在前后端的共同父目录单开环境会话：「请按 [AI_SETUP.md](AI_SETUP.md) 初始化，仅开发。」`matt init` 安装派单工具；随后在**同一父目录**按提示显式运行一次 `$mattpocock-skills:setup-matt-pocock-skills`，确认两端共用的工单和领域文档约定。已有父层配置直接复用，不在子仓重复初始化。

**可选 E2E**：首次未指定模式时会询问一次，选择保存在 `.matt/workflow.json`。已接入 Orca 团队的项目首次开启时默认用原生浏览器。已有 Midscene 项目继续执行原 YAML；可用 `--e2e-provider orca|midscene` 显式选择。以后可用 `update --e2e on|off --apply` 切换，不影响 Matt 工程约定。

**日常开发**：环境就绪后，在同一父目录新开需求会话，例如：`$matt-full-stack 让客服能在工单列表领取待处理工单，刷新后仍能看到处理人。`

**Orca bot 团队**：按 [Orca 安装指南](ORCA_SETUP.md)，在本仓库执行 `node bin/matt-orca.mjs plan --workspace <消费父目录>`。安装器提供 `plan / apply / doctor`，同步主控、前端、后端和质量四个 bot 的职责与 skills，支持创建卡片、目录登记、冲突检测和重复升级。模型优先使用本次派单指定值，其次角色配置；未指定时使用接单 bot 自身的默认模型。

新功能先澄清影响行为的业务决定，再请你评审 `spec/<需求名>/` 的公共 spec 和涉及端的 spec。需求已经写清楚也会停在评审这一步。启用 E2E 时，Quality（其他宿主由父层验收会话）先从草案写具名用例，业务预期在同一次评审确认。你确认「按这版开发」后才派单：前端读 `shared.md` 和 `frontend.md`，后端读 `shared.md` 和 `backend.md`。父会话汇总交接和验收，不要求你另开会话或再调用 `grill-with-docs`。

**可选工作树隔离**：默认复用原 checkout。若在[会话配置](AI_SETUP.md#跨工具会话配置)为某端启用 `worktree: true`，由当前工具从**该端当前开发分支**创建并绑定任务工作树，再按仓库约定初始化。验证完成后会询问「哪些端要合回各自的原分支？」；不会因批准开发就自动合并或清理。

**已有功能异常**：仍用同一入口，例如 `$matt-full-stack 只排查：领取工单后刷新又变回未领取。` 只排查会在给出复现和定位结果后停止；改成「排查并修复」才会派修，最后重跑「领取 → 刷新」。两种 E2E 模式都可以排障。

**只审改动**：`$matt-full-stack 只审前端相对 main 的改动。` 从父目录发起即可。没说审哪端或相对哪个版本时，只确认缺的部分；两端都审则分开出报告。

**按已有工单开发**：把工单 URL 或父目录下的工单路径附在需求后；只有 `#123` 时，按父层约定确认项目。派单、审查和交付都使用同一引用，不会因为测试通过就关单。项目未要求工单时，仍可直接描述需求。

**第一次体验**：在工具包根目录执行 `node examples/create-workspace.mjs ../matt-ticket-demo --e2e off`（需要浏览器验收则选 `on`）。按[体验指南](examples/README.md)在新父目录完成初始化，再开需求会话实现[客服领取工单](examples/REQUIREMENT.md)。

| 入口 | 作用 |
|---|---|
| `node <工具包>/bin/matt.mjs discover` | 只读识别候选项目、启动命令与健康地址 |
| `node <工具包>/bin/matt.mjs init` / `update` | 默认预览；加 `--apply` 才写入。`--e2e off` 仅开发，`--e2e on` 启用 E2E |
| `node .matt/runtime/run.mjs plan` | 显示验收开关和执行工具。Orca 模式由 Quality 按[预先写好的用例](templates/matt-full-stack/references/acceptance.md)操作原生浏览器 |
| `node .matt/runtime/run.mjs model-config` | 离线列出缺少的模型必填项，不显示已有值 |
| `node .matt/runtime/run.mjs setup <前端端口> <后端端口>` | 初始化或升级：验证模型，再运行隔离夹具的浏览器自测；仅诊断链路可单独运行 `selftest` |
| `node .matt/runtime/run.mjs doctor` / `test` | 业务验收：检查配置的服务地址或运行项目的 Midscene Test YAML |
| [父会话工作流](templates/matt-full-stack/SKILL.md) | 按交付物选择工作流。只要调研、原型、审查或 PR 正文就交付后停止 |
| [实现与修复派单模板](templates/matt-full-stack/references/dispatch.md) | 只向责任端派单，直接按 TDD 开发；审已提交版本或包含未提交文件的完整补丁，不强制提交 |
| [会话配置](AI_SETUP.md#跨工具会话配置) | 按角色配置模型和 worktree，从父目录执行 `node .matt/runtime/sessions.mjs` 输出跨工具派单设置 |
| [验证记录](VALIDATION.md) | 自动化演练、实际浏览器结果与未验证范围 |

开发：Node 22.12+。`npm test` 验证安装与升级；`npm run test:selftest` 在临时体验工作区验证隔离链路和接错后端的失败路径；`npm run test:browser` 回归业务验收运行器。两项浏览器测试均使用 `.work/`，首次安装依赖与 Chromium 需要网络。

初始化只在消费父目录注册 `matt-full-stack`。父会话可调用宿主提供的其他 mattpocock skill，例如 `research`、`prototype`、`pr`。插件入口不可用时，只有[随包收录的 8 个 skill](src/matt-skills.mjs) 可从 `vendor/mattpocock/` 读取；其他需宿主提供。[随包参考的上游修订](https://github.com/mattpocock/skills/tree/abeeaf95660ba9e8b7c753eb38f441ca707a8823)
