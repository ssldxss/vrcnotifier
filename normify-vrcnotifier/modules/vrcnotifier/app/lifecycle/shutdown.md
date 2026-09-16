---
uid: f3853e83
id: vrcnotifier.app.lifecycle.shutdown
parent: vrcnotifier.app.lifecycle
name: {zh: "优雅退出", en: "Graceful Shutdown"}
description:
  zh: >
      响应 SIGINT/SIGTERM（双击则强制退出）：依次推送停止通知、停监控与看门狗定时器、停头像清理定时器、停健康探测、停全部 QQ 机器人、停用活跃账号，最后 checkpoint 并关闭数据库、关闭 HTTP 监听。
      
  en: >
      Handles SIGINT/SIGTERM (a second signal forces exit): sends the shutdown notice, stops monitor and watchdog timers, the avatar sweep timer, health probing and all QQ bots, deactivates active accounts, then checkpoints and closes the database and closes the HTTP listener.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:27.989Z"
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
    from_api: "rpc:shutdown()"
    to_api: "rpc:sendShutdownNotice()"
    label: {zh: "通知并停用", en: "Notify and deactivate"}
  - kind: call
    to: vrcnotifier.monitor.timers
    from_api: "rpc:shutdown()"
    to_api: "rpc:stopTimers()"
    label: {zh: "停止定时器", en: "Stop timers"}
  - kind: call
    to: vrcnotifier.qq.bot.registry
    from_api: "rpc:shutdown()"
    to_api: "rpc:stopAll()"
    label: {zh: "停 QQ 机器人", en: "Stop QQ bots"}
  - kind: call
    to: vrcnotifier.infra.avatar.maintenance
    from_api: "rpc:shutdown()"
    to_api: "rpc:clear()"
    label: {zh: "停头像清理", en: "Stop avatar sweeping"}
  - kind: call
    to: vrcnotifier.vrc.health
    from_api: "rpc:shutdown()"
    to_api: "rpc:stop()"
    label: {zh: "停健康探测", en: "Stop health probing"}
  - kind: call
    to: vrcnotifier.data.schema
    from_api: "rpc:shutdown()"
    to_api: "rpc:close()"
    label: {zh: "checkpoint 并关库", en: "Checkpoint and close"}
---
