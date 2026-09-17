---
uid: f3853e83
id: vrcnotifier.app.lifecycle.shutdown
parent: vrcnotifier.app.lifecycle
name: {zh: "优雅退出", en: "Graceful Shutdown"}
description:
  zh: >
      退出时按顺序收尾：先告知监控要停了，再关掉定时器和机器人，最后安全地存好数据库。
      
  en: >
      Shuts down in order: tells you monitoring is stopping, stops the timers and bots, and closes the database safely.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.251Z"
fingerprint: f25564c89baf4114b3baf36c945152cf491a94287d92e6f2350aba5bd057df88
source:
  - path: "src/index.js"
    line: 364
    end_line: 384
apis:
  - protocol: rpc
    path: "shutdown()"
    description:
      zh: >
          停止全部服务并安全关闭资源。
          
      en: >
          Stop all services and close resources safely.
          
deps:
  - kind: call
    to: vrcnotifier.monitor.session
    label: {zh: "通知并停用", en: "Notify and deactivate"}
  - kind: call
    to: vrcnotifier.monitor.timers
    label: {zh: "停止定时器", en: "Stop timers"}
  - kind: call
    to: vrcnotifier.qq.bot.registry
    label: {zh: "停 QQ 机器人", en: "Stop QQ bots"}
  - kind: call
    to: vrcnotifier.infra.avatar.maintenance
    label: {zh: "停头像清理", en: "Stop avatar sweeping"}
  - kind: call
    to: vrcnotifier.vrc.health
    label: {zh: "停健康探测", en: "Stop health probing"}
  - kind: call
    to: vrcnotifier.data.schema
    label: {zh: "checkpoint 并关库", en: "Checkpoint and close"}
---
