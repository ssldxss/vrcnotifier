---
uid: 356da4ea
id: vrcnotifier.app.wiring
parent: vrcnotifier.app
name: {zh: "依赖装配", en: "Dependency Wiring"}
description:
  zh: >
      buildApplication 的装配三个阶段：基础服务（数据库/日志流/文件日志/头像缓存/事件总线/会话表）→ 领域服务（VRChat 客户端、世界名、QQ、通知器、WS 管线、监控、健康与状态探测）→ HTTP 应用与令牌打码状态。
  en: >
      The three wiring phases of buildApplication: foundation services (database, log stream, file log, avatar cache, event bus, session store), domain services (VRChat client, world names, QQ, notifier, WS pipeline, monitor, health and status probes), then the HTTP app and token-masking state.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:35:00Z"
fingerprint: f25564c89baf4114b3baf36c945152cf491a94287d92e6f2350aba5bd057df88
source:
  - path: "src/index.js"
---
