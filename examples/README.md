# 用客服工单台体验完整流程

这里的 `frontend/` 和 `backend/` 是一对专供体验的前后端项目。起点是一个能登录、能查看两张工单的客服工作台。你扮演产品负责人，把「让客服领取工单」交给 AI，就能体验澄清需求、两端独立开发和浏览器验收。场景与预期都写在[体验需求](REQUIREMENT.md)里。

## 1. 创建一套自己的体验项目

准备 Node.js 22.12+、npm 和 Git。在 **matt-Full-stack 工具包根目录**运行以下命令，目标选一个尚未创建的目录。

```sh
node examples/create-workspace.mjs ../matt-ticket-demo
cd ../matt-ticket-demo
```

脚本会把两个项目复制到新目录，为两端分别创建本地 Git 仓库和初始提交，并在共同父目录安装工具包、放入体验需求和浏览器基线用例。想从头再体验一遍时，换一个新的目标目录即可。

## 2. 给 AI 一个需求

用你常用的 AI 开发工具打开新建的 **`matt-ticket-demo` 父目录**，在父会话发送下面这段话。

> 请按 `$matt-full-stack` 完成 `REQUIREMENT.md` 中的「客服领取工单」。先按 `.matt/AI_SETUP.md` 安装依赖和 Chromium，启动两个项目，跑通工单列表基线。请你自行查找页面和接口，与我确认需要决定的问题，再把同一份 spec 分别派给前端和后端会话。两端就绪后，用真实浏览器验收领取、刷新和冲突，告诉我每个场景的结果与报告位置。

你可以直接按需求里的四项预期确认范围。**先看到两张工单，再看到新能力**。基线中 `QA-101` 待领取，`QA-102` 由客服乙处理。开发完成后，领取 `QA-101` 并刷新，应当仍显示「处理中 · 体验客服」。两端各自交回版本，父会话记录实际运行的组合和验收结果。

## 3. 查看页面与验证记录

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
