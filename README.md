<img src="assets/icon.svg" width="64" height="64" alt="">

# matt-Full-stack

把两个独立项目接到同一份需求、接口契约与浏览器验收上。工具装在**共同父目录**，不接管子仓；不要求发布包、改造现有工程或合并 Git 历史。

**交给 AI：**「请按这个工具包的 [AI_SETUP.md](AI_SETUP.md)，在当前前后端共同父目录初始化或升级，自动发现并验证环境。」

| 入口 | 作用 |
|---|---|
| `node <工具包>/bin/matt.mjs discover` | 只读识别候选项目、启动命令与健康地址 |
| `node <工具包>/bin/matt.mjs init` / `update` | 默认预览；加 `--apply` 才写入 |
| `node .matt/runtime/run.mjs doctor` / `test` | 在已安装的消费父目录检查环境或运行原生 Midscene Test YAML |
| [工作流 skill](templates/matt-full-stack/SKILL.md) | 父层澄清与维护 YAML；子仓独立 TDD、review、交接；父层验收实际版本组合 |
| [子会话派单模板](templates/matt-full-stack/references/dispatch.md) | 前后端分别调用 `implement`，用 `tdd` 和 `code-review` 交付，验收失败回原会话修复 |
| [会话配置](AI_SETUP.md#跨工具会话配置) | 按角色配置模型和 worktree，从父目录执行 `node .matt/runtime/sessions.mjs` 输出跨工具派单设置 |
| [验证记录](VALIDATION.md) | 自动化演练、实际浏览器结果与未验证范围 |

开发：Node 22.12+，`npm test` 验证安装与升级；`npm run test:browser` 在 `.work/` 新建含两个 Git 子仓的全栈夹具，安装锁定依赖并运行 Chromium（首次需要网络）。

父目录自带流程所需的上游 skill 和引用文件，包括 `grill-with-docs`、`grilling`、`domain-modeling`、`implement`、`tdd`、`code-review`，以及按需使用的 `codebase-design` 和 `diagnosing-bugs`。本地副本以 `vendor/mattpocock/LICENSE` 授权，`scripts/vendor-grill.mjs` 可从固定修订重建。浏览器引擎使用原生 `@midscene/test` 的 `cases/steps`。[mattpocock/skills 固定修订](https://github.com/mattpocock/skills/tree/abeeaf95660ba9e8b7c753eb38f441ca707a8823)
