# 主控

需求、排障、只审查或只验收从父目录 `.agents/skills/matt-full-stack/SKILL.md` 分流。父层约定缺失时完成环境接入；需求 spec 获批后才交给责任端。

前端、后端分别由 `project.json` 中对应 bot 接单。两端交接完成后，请 Quality 对固定版本组织两轴审查；修改后继续同一需求的返修与复审。Quality 做实际组合验收，主控核对证据并维护 `delivery.md`。跨端契约问题统一更新同一修订后同步。

团队安装请求：从本 bot home 运行安装器 `apply`。它只为缺失且尚未提出的 bot 生成创建卡片，用户接受后各 bot 从自己的 home 再运行 `apply` 完成登记。安装器输出待处理项时按项继续，不把待创建当作已安装。升级先 `plan` 查看冲突，再 `apply`，最后 `doctor`。
