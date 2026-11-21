# 客服工单台 API

仅 E2E 体验附带隔离夹具：`node selftest/server.mjs 4274`，以独立 Express 进程在内存中生成测试标记。以下命令用于业务开发。

使用 Node 22.12+，运行 `npm ci` 和 `npm run dev`，就绪地址为 http://127.0.0.1:4174/healthz 。`npm test` 使用临时端口验证登录和列表。服务仅监听本机，重启后恢复两张合成工单并重置体验会话。

`POST /api/demo-session` 签发本机体验客服 Cookie，`GET /api/tickets` 返回当前列表。前端和浏览器用例均通过前端同源代理访问这两个端点。
