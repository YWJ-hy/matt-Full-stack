# 用客服工单台体验完整流程

这里的 `frontend/` 和 `backend/` 是一对专供体验的前后端项目。起点是一个能登录、能查看两张工单的客服工作台。你扮演产品负责人，把「让客服领取工单」交给 AI，就能体验澄清需求、两端独立开发和浏览器验收。场景与预期都写在[体验需求](REQUIREMENT.md)里。

## 1. 创建一套自己的体验项目

准备 Node.js 22.12+、npm 和 Git。在 **matt-Full-stack 工具包根目录**运行以下命令，目标选一个尚未创建的目录。

```sh
node examples/create-workspace.mjs ../matt-ticket-demo
cd ../matt-ticket-demo
```

脚本会把两个项目复制到新目录，为两端分别创建本地 Git 仓库和初始提交，并在共同父目录安装工具包、放入体验需求和浏览器基线用例。想从头再体验一遍时，换一个新的目标目录即可。

## 2. 首次使用：开一个环境会话

用 AI 开发工具打开 **`matt-ticket-demo` 父目录**。脚本已经安装了工具包；在第一个会话中发送：

> 请按 `.matt/AI_SETUP.md` 准备体验环境，跑通 `e2e/cases/ticket-list.yaml` 的工单列表基线。

`doctor` 检查通过、浏览器基线 `BASE-01` 通过就结束这个会话。此时能看到两张工单：`QA-101` 待领取，`QA-102` 由客服乙处理，还没有领取按钮。基线未通过就在环境会话排查，不开始实现需求。

## 3. 日常开发：另开一个需求会话

在**同一父目录新开会话**，只发送业务需求：

> `$matt-full-stack` 实现 `REQUIREMENT.md` 中的「客服领取工单」。

日常也可以直接描述需求，不必先写需求文件。技能会查找页面和接口，只向你确认无法推断的业务决定，再按公共契约向需要改动的端分别派单。完成后看每个场景的真实浏览器验收结果和报告位置：例如领取 `QA-101` 后刷新，仍应显示「处理中 · 体验客服」。

## 4. 查看页面与验证记录

服务运行时，在浏览器打开 `http://127.0.0.1:4173/`，点「以体验客服身份登录」。浏览器用例通过前端代理向本机后端建立同一角色的会话。重启后端会重置数据和会话，适合重新演练。基线使用 DOM 断言，模型调用为零。新增验收用例若使用视觉模型，按父目录手册配置模型凭据，或让 AI 编写确定性的浏览器交互与断言。

如需手动复现，可在体验父目录运行以下准备命令。Windows PowerShell 如果限制执行 `npm.ps1`，把 `npm` 写成 `npm.cmd`。

```sh
npm ci --prefix backend
npm ci --prefix frontend
npm ci --prefix .matt/runtime --ignore-scripts --no-audit --no-fund
node .matt/runtime/run.mjs chromium
```

打开两个终端，均位于体验父目录，一个运行 `npm run dev --prefix backend`，另一个运行 `npm run dev --prefix frontend`。保留两个服务，在第三个终端运行以下命令。

```sh
node .matt/runtime/run.mjs doctor
node .matt/runtime/run.mjs test e2e/cases/ticket-list.yaml
```

预期两端返回 HTTP 200，`BASE-01` 通过。业务实现完成后可用 `node .matt/runtime/run.mjs test` 运行父会话维护的全部用例。结果在 `.matt/reports/`，两端各自的测试命令是 `npm test --prefix frontend` 和 `npm test --prefix backend`。体验结束时用 Ctrl+C 关闭两个服务。
