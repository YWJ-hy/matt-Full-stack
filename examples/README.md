# 用客服工单台体验完整流程

这里的 `frontend/` 和 `backend/` 是一对专供体验的前后端项目。起点是一个能登录、能查看两张工单的客服工作台。你扮演产品负责人，把「让客服领取工单」交给 AI，就能体验澄清需求、两端独立开发和浏览器验收。场景与预期都写在[体验需求](REQUIREMENT.md)里。

## 1. 创建一套自己的体验项目

准备 Node.js 22.12+、npm 和 Git。在 **matt-Full-stack 工具包根目录**运行以下命令，目标选一个尚未创建的目录。

```sh
node examples/create-workspace.mjs ../matt-ticket-demo --e2e off
cd ../matt-ticket-demo
```

脚本为两端创建独立 Git 仓库、安装派单工具并放入体验需求。`--e2e off` 不需要 Midscene 模型或浏览器。要体验 E2E，在新目录用 `--e2e on` 创建，脚本才会放入浏览器基线用例和隔离夹具；交互终端省略选项会询问模式。

## 2. 在体验父目录初始化

用 AI 开发工具打开 **`matt-ticket-demo` 父目录**，在环境会话中发送：

> `$mattpocock-skills:setup-matt-pocock-skills` 为这个共同父目录配置共享工程约定。

体验项目没有父层 Git 仓库，工单可选本地 Markdown。确认草案并完成 setup 后，**仅开发直接到第 3 节**。

**仅启用 E2E**：在同一环境会话继续发送：

> 请按 `.matt/AI_SETUP.md` 初始化 Midscene E2E 环境，向我询问缺少的模型配置，验证模型和隔离链路。

会话先询问缺少的 base URL、模型名、family 和 API key；Key 通过安全输入或本地私密编辑器填写，别贴到聊天里。经你同意后，`setup` 调用模型验证，再用 `ENV-01` 检查浏览器能否通过隔离前端读到内存后端的本次标记。两项都通过才完成初始化。不启动工单服务、不登录、不读写数据库。

**手动复现**：先按 `.matt/AI_SETUP.md` 第 2 节在本地填写模型配置并确认可发送验证请求（可能计费）。以下命令均在体验父目录运行，PowerShell 必要时用 `npm.cmd`：

```sh
npm ci --prefix backend --ignore-scripts
npm ci --prefix frontend --ignore-scripts
npm ci --prefix .matt/runtime --ignore-scripts --no-audit --no-fund
node .matt/runtime/run.mjs chromium
```

在两个终端分别运行 `node backend/selftest/server.mjs 4274` 和 `node frontend/selftest/server.mjs 4273 4274`。确认两端启动成功，在第三个终端运行：

```sh
node .matt/runtime/run.mjs setup 4273 4274
```

报告在 `.matt/reports/selftest-*/`。若端口已占用，换两个空闲端口并同步修改三条命令；完成后用 Ctrl+C 停止两个夹具。

## 3. 日常开发：另开一个需求会话

在**同一父目录新开会话**，只发送业务需求：

> `$matt-full-stack` 实现 `REQUIREMENT.md` 中的「客服领取工单」。

这份需求已列出四个场景，所以不一定需要追问。想体验访谈，可换成自己的开放需求，并说明与示例的区别。父会话先查已有事实；仍需你决定的业务问题会分轮询问。

在开始编码前，你会收到需求共用规则、任务包与 `acceptance.md` 的评审链接。先看公共场景：例如，同一客服从第二个窗口重复领取时，给出的结果是否符合你的预期？有修改就直接说，等新版；满意再回复「按这版开发」。前后端按同一任务包及 api.md 对接。

开发后在同目录的 `delivery.md` 查看两端版本、测试与审查结果。仅开发时注明「按项目配置未执行 E2E」；启用 E2E 时，另外查看各场景的浏览器验收结果和报告。

## 4. 仅启用 E2E：在业务会话中验收工单

服务运行时，在浏览器打开 `http://127.0.0.1:4173/`，点「以体验客服身份登录」。浏览器用例通过前端代理向本机后端建立同一角色的会话。重启后端会重置数据和会话，适合重新演练。业务基线使用 DOM 断言，不调用模型；需要视觉步骤的新用例可使用初始化时已验证的配置。

如需在业务阶段手动复现，打开两个终端，均位于体验父目录，一个运行 `npm run dev --prefix backend`，另一个运行 `npm run dev --prefix frontend`。保留两个服务，在第三个终端运行以下命令。

```sh
node .matt/runtime/run.mjs doctor
node .matt/runtime/run.mjs test e2e/cases/ticket-list.yaml
```

预期两端返回 HTTP 200，`BASE-01` 通过。业务实现完成后可用 `node .matt/runtime/run.mjs test` 运行父会话维护的全部用例。结果在 `.matt/reports/`，两端各自的测试命令是 `npm test --prefix frontend` 和 `npm test --prefix backend`。体验结束时用 Ctrl+C 关闭两个服务。
