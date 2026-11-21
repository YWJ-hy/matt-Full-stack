---
name: matt-full-stack
description: 在独立前后端仓库的共同父目录按任务选择 mattpocock 工作流，用于调研、原型、审查等独立交付，或派发产品改动、验收已有版本。
---

## 先确定交付物

用户点名的 mattpocock skill 优先；否则按交付物选择当前宿主提供的 skill。先尝试插件限定名。若会话没有该入口，仅当工具包中确有可读的 `vendor/mattpocock/<短名>/SKILL.md` 时，才读取其指令与引用，或将可读绝对路径交给执行者。两者都不可用时说明缺少哪个 skill，停在该步骤，不擅自切换到实现。

- **独立交付物**：例如调研结论用 `$mattpocock-skills:research`，一次性原型用 `$mattpocock-skills:prototype`，审查现有改动用 `$mattpocock-skills:code-review`，PR 正文用 `$mattpocock-skills:pr`。其他工作流按宿主提供的描述选择。交付所请求的结果即结束；原型不是产品改动，审查发现也不是修复授权。需要委派时传该任务自己的范围与交付物，不套实现单。
- **只验收已有版本**：直接执行下文第 5 步，报告通过、失败或阻塞及证据。只有用户也要求修复时才继续第 6 步。
- **正式实现或修复**：只有请求包含产品代码改动时才进入功能交付流程。复用已有结论、契约和用例，从尚未完成的步骤继续；用户指定的方法随单传给实现会话。

## 功能交付流程

1. **澄清需求。** 父会话调用 `$mattpocock-skills:grill-with-docs`，按它的指令调用 `$mattpocock-skills:grilling` 和 `$mattpocock-skills:domain-modeling`。先查前端路由、请求、后端 handler 和仓库指令，只询问无法推断的业务决定。复用已确认的决定，术语和必要的 ADR 写在父层。
2. **确定怎样验收。** 父会话用 `spec/full-stack.md` 建立公共工作单，记录契约版本、成功和失败响应、合成数据与清理、各端已确认的公开测试边界、用户能看到的预期。把每个场景 ID 对应到 `e2e/cases/*.yaml` 的具名 case。允许委派时可请子会话只读设计复杂场景，由父会话核实并维护原生 `cases/steps`。
3. **只派需要改代码的端。** 在共同父目录对每个相关角色执行 `node .matt/runtime/sessions.mjs <角色>`：实现端取 `frontend` 或 `backend`，并取 `standards`、`spec` 两路审查设置传给实现端。按[实现与修复派单模板](references/dispatch.md)填入本端起始 SHA、公共 spec 版本和相关 case。每个实现会话固定调用 `$mattpocock-skills:implement`，由它调用 `$mattpocock-skills:tdd` 和 `$mattpocock-skills:code-review`。向受影响的一端或两端发送并登记会话引用；无法启动时只交付对应的待派提示词。
4. **独立交接。** 每端完成测试、审查、修复与复测，按该仓权限提交，交回版本、测试结果及联调条件。父会话逐端登记。任何一端都可以先交接，组合验收等相关版本就绪再开始。
5. **验收实际组合。** 按父目录 `.matt/AI_SETUP.md` 核对运行服务的版本，用真实浏览器、授权测试账号、真实测试后端和合成数据执行相关 YAML，核查可见断言、持久化或跨端读回。记录版本对、场景结果和私有报告位置。仅通过 mock 或缺少前提的场景标记为待真实验收。
6. **失败回派与复验。** 对照契约、浏览器现象和接口证据判定责任。产品缺陷将修复单发回对应的原子会话。根因不明时显式调用 `$mattpocock-skills:diagnosing-bugs` 定位。两端都有偏差则分别回派。登录、数据、夹具或 YAML 有误由父会话修正。若契约确实需要变更，先确认业务决定，再同步 spec、YAML 和两端任务。每次收到修复版本，父会话核对新组合，重跑失败 case 及受影响场景；登记通过、仍失败或阻塞，以及待处理原因。
