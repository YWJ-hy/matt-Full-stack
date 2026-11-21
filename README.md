<img src="assets/icon.svg" width="64" height="64" alt="">

# matt-Full-stack

把两个独立项目接到同一份需求、接口契约与浏览器验收上。工具装在**共同父目录**，不接管子仓；不要求发布包、改造现有工程或合并 Git 历史。

**首次接入或升级**：在共同父目录单开环境会话：「请按这个工具包的 [AI_SETUP.md](AI_SETUP.md) 初始化或升级，并验证环境。」

**日常开发**：环境就绪后，在同一父目录新开需求会话，例如：`$matt-full-stack 让客服能在工单列表领取待处理工单，刷新后仍能看到处理人。`

**第一次体验**可以从客服工单台开始。在工具包根目录执行 `node examples/create-workspace.mjs ../matt-ticket-demo`，然后按[体验指南](examples/README.md)打开环境会话。会话会询问缺少的视觉模型配置；模型验证和隔离链路自测均通过才算初始化完成。此时不启动工单应用、不连接数据库；另开需求会话才实现[客服领取工单](examples/REQUIREMENT.md)。

| 入口 | 作用 |
|---|---|
| `node <工具包>/bin/matt.mjs discover` | 只读识别候选项目、启动命令与健康地址 |
| `node <工具包>/bin/matt.mjs init` / `update` | 默认预览；加 `--apply` 才写入 |
| `node .matt/runtime/run.mjs model-config` | 离线列出缺少的模型必填项，不显示已有值 |
| `node .matt/runtime/run.mjs setup <前端端口> <后端端口>` | 初始化或升级：验证模型，再运行隔离夹具的浏览器自测；仅诊断链路可单独运行 `selftest` |
| `node .matt/runtime/run.mjs doctor` / `test` | 业务验收：检查配置的服务地址或运行项目的 Midscene Test YAML |
| [父会话工作流](templates/matt-full-stack/SKILL.md) | 按交付物选择工作流。只要调研、原型、审查或 PR 正文就交付后停止；只验收已有版本就直接跑相关场景 |
| [实现与修复派单模板](templates/matt-full-stack/references/dispatch.md) | 只向要改产品代码的端派 `implement`，用 `tdd` 和 `code-review` 交付，再由父层验收实际组合 |
| [会话配置](AI_SETUP.md#跨工具会话配置) | 按角色配置模型和 worktree，从父目录执行 `node .matt/runtime/sessions.mjs` 输出跨工具派单设置 |
| [验证记录](VALIDATION.md) | 自动化演练、实际浏览器结果与未验证范围 |

开发：Node 22.12+。`npm test` 验证安装与升级；`npm run test:selftest` 在临时体验工作区验证隔离链路和接错后端的失败路径；`npm run test:browser` 回归业务验收运行器。两项浏览器测试均使用 `.work/`，首次安装依赖与 Chromium 需要网络。

初始化只在消费父目录注册 `matt-full-stack`。父会话可调用宿主提供的其他 mattpocock skill，例如 `research`、`prototype`、`pr`。插件入口不可用时，只有[随包收录的 8 个 skill](src/matt-skills.mjs) 可从 `vendor/mattpocock/` 读取；其他需宿主提供。[随包参考的上游修订](https://github.com/mattpocock/skills/tree/abeeaf95660ba9e8b7c753eb38f441ca707a8823)
