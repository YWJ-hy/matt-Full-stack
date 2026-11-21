<img src="assets/icon.svg" width="64" height="64" alt="">

# matt-Full-stack

把两个独立项目接到同一份需求、接口契约与浏览器验收上。工具装在**共同父目录**，不接管子仓；不要求发布包、改造现有工程或合并 Git 历史。

**交给 AI：**「请按这个工具包的 [AI_SETUP.md](AI_SETUP.md)，在当前前后端共同父目录初始化或升级，自动发现并验证环境。」

**第一次体验**可以从客服工单台开始。在工具包根目录执行 `node examples/create-workspace.mjs ../matt-ticket-demo`，然后在新目录打开父会话，把 `REQUIREMENT.md` 交给 AI。示例提供能运行的前后端、两张合成工单和「客服领取工单」需求。[体验指南](examples/README.md) · [需求与验收场景](examples/REQUIREMENT.md)

| 入口 | 作用 |
|---|---|
| `node <工具包>/bin/matt.mjs discover` | 只读识别候选项目、启动命令与健康地址 |
| `node <工具包>/bin/matt.mjs init` / `update` | 默认预览；加 `--apply` 才写入 |
| `node .matt/runtime/run.mjs doctor` / `test` | 在已安装的消费父目录检查环境或运行原生 Midscene Test YAML |
| [父会话工作流](templates/matt-full-stack/SKILL.md) | 按交付物选择工作流。只要调研、原型、审查或 PR 正文就交付后停止；只验收已有版本就直接跑相关场景 |
| [实现与修复派单模板](templates/matt-full-stack/references/dispatch.md) | 只向要改产品代码的端派 `implement`，用 `tdd` 和 `code-review` 交付，再由父层验收实际组合 |
| [会话配置](AI_SETUP.md#跨工具会话配置) | 按角色配置模型和 worktree，从父目录执行 `node .matt/runtime/sessions.mjs` 输出跨工具派单设置 |
| [验证记录](VALIDATION.md) | 自动化演练、实际浏览器结果与未验证范围 |

开发：Node 22.12+，`npm test` 验证安装与升级；`npm run test:browser` 在 `.work/` 新建含两个 Git 子仓的全栈夹具，安装锁定依赖并运行 Chromium（首次需要网络）。

初始化只在消费父目录注册 `matt-full-stack`。父会话可调用宿主提供的其他 mattpocock skill，例如 `research`、`prototype`、`pr`。插件入口不可用时，只有[随包收录的 8 个 skill](src/matt-skills.mjs) 可从 `vendor/mattpocock/` 读取；其他需宿主提供。[随包参考的上游修订](https://github.com/mattpocock/skills/tree/abeeaf95660ba9e8b7c753eb38f441ca707a8823)
