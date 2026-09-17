---
uid: f6a54423
id: vrcnotifier.monitor.fault
parent: vrcnotifier.monitor
name: {zh: "断线与恢复提醒", en: "Outage & Recovery Notices"}
description:
  zh: >
      网络断了或登录失效时先安静等一会儿；拖得太久才提醒你一次，恢复了再补一句。
      
  en: >
      When the connection drops or a login expires it stays quiet at first; only a longer outage is worth a message, and recovery gets a short follow-up.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.879Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
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
