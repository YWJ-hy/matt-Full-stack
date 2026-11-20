---
name: matt-full-stack
description: 在独立前后端仓库的共同父目录澄清跨端需求、交接单端实现或运行最终组合验收。
---

显式调用宿主已安装的 mattpocock 插件 skill。若某个会话无法调用插件，父会话可提供上游工具包中 `vendor/mattpocock/<短名>/SKILL.md` 的可读绝对路径，供其直接读取及查阅引用。

派单前，在共同父目录执行 `node .matt/runtime/sessions.mjs`，解析前端、后端和两路审查的启动设置。把每个角色的结果交给实际启动该会话的工具，同时把两路审查设置传给各端。具体启动和交接规则见 [派单模板](references/dispatch.md)。

1. **澄清需求。** 父会话调用 `$mattpocock-skills:grill-with-docs`，按它的指令调用 `$mattpocock-skills:grilling` 和 `$mattpocock-skills:domain-modeling`。先查前端路由、请求、后端 handler 和仓库指令，只询问无法推断的业务决定。复用已确认的决定，术语和必要的 ADR 写在父层。
2. **确定怎样验收。** 父会话用 `spec/full-stack.md` 建立公共工作单，记录契约版本、成功和失败响应、合成数据与清理、各端已确认的公开测试边界、用户能看到的预期。把每个场景 ID 对应到 `e2e/cases/*.yaml` 的具名 case。允许委派时可请子会话只读设计复杂场景，由父会话核实并维护原生 `cases/steps`。
3. **分别派单。** 读取 [前端、后端及修复提示词](references/dispatch.md)，填入两个仓库各自的起始 SHA、同一 spec 版本及相关 case。给每个实现会话显式派发 `$mattpocock-skills:implement`，由它调用 `$mattpocock-skills:tdd` 和 `$mattpocock-skills:code-review`。有会话工具时分别发送并记下两个会话的引用。没有时交付两份填好的提示词，标注待派发。
4. **独立交接。** 每端完成测试、审查、修复与复测，按该仓权限提交，交回版本、测试结果及联调条件。父会话逐端登记。任何一端都可以先交接，组合验收等相关版本就绪再开始。
5. **验收实际组合。** 按父目录 `.matt/AI_SETUP.md` 核对运行服务的版本，用真实浏览器、授权测试账号、真实测试后端和合成数据执行相关 YAML，核查可见断言、持久化或跨端读回。记录版本对、场景结果和私有报告位置。仅通过 mock 或缺少前提的场景标记为待真实验收。
6. **失败回派与复验。** 对照契约、浏览器现象和接口证据判定责任。产品缺陷将修复单发回对应的原子会话。根因不明时显式调用 `$mattpocock-skills:diagnosing-bugs` 定位。两端都有偏差则分别回派。登录、数据、夹具或 YAML 有误由父会话修正。若契约确实需要变更，先确认业务决定，再同步 spec、YAML 和两端任务。每次收到修复版本，父会话核对新组合，重跑失败 case 及受影响场景；登记通过、仍失败或阻塞，以及待处理原因。
