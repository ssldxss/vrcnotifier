---
uid: f6a54423
id: vrcnotifier.monitor.fault
parent: vrcnotifier.monitor
name: {zh: "故障窗口与启停通知", en: "Fault Window & Lifecycle Notices"}
description:
  zh: >
      断线与 401 的统一故障语义（首次连接不算故障）：故障开始时打时间戳并挂定时器，只有持续超过阈值才推送一次故障通知，之后若恢复则补发一条恢复说明。订阅 ws-open/ws-close/relogin-needed/unauthorized-2fa/snapshot/session-expired 来驱动启动说明、恢复文案与会话失效通知。
      
  en: >
      Unified fault semantics for disconnects and 401s (the first connection never counts as a fault): a fault stamps the start time and arms a timer; only if it lasts past the threshold is one failure notice sent, and a recovery afterwards sends a matching recovery notice. It subscribes to ws-open/ws-close/relogin-needed/unauthorized-2fa/snapshot/session-expired to drive startup notices, recovery texts and the session-invalidated notice.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:58.166Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
    line: 60
    end_line: 194
apis:
  - protocol: rpc
    path: "sysNotify(user, title, body)"
    description:
      zh: >
          经通知渠道推送系统通知。
          
      en: >
          Push a system notification through the notification channels.
          
  - protocol: rpc
    path: "maybeSendLifecycle(user)"
    description:
      zh: >
          每次连接只发一次的启动/恢复说明。
          
      en: >
          Send the startup or recovery notice once per connection.
          
  - protocol: rpc
    path: "startFault(userId, s, reason)"
    description:
      zh: >
          开启故障窗口并挂起延迟故障通知。
          
      en: >
          Start the fault window and arm the delayed failure notice.
          
  - protocol: rpc
    path: "tryRecover(userId, s)"
    description:
      zh: >
          判定恢复（API 正常且 WS 已连）并发送恢复说明。
          
      en: >
          Evaluate recovery (API ok and WS connected) and send the recovery notice.
          
deps:
  - kind: call
    to: vrcnotifier.qq.notifier
    label: {zh: "发送系统通知", en: "Send system notices"}
  - kind: event
    to: vrcnotifier.vrc.pipeline.control
    label: {zh: "跟踪连接事件", en: "Track connection events"}
---
