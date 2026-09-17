---
uid: 034a8075
id: vrcnotifier.monitor.notify.vrc-notification
parent: vrcnotifier.monitor.notify
name: {zh: "站内通知解析与推送", en: "VRChat Notification Parsing & Dispatch"}
description:
  zh: >
      处理 VRChat 站内通知，但只转发你关心的三类：世界邀请、戳一戳、群组公告。
      
  en: >
      Handles VRChat's own notifications, but only forwards the three kinds you care about: world invites, boops and group announcements.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.881Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
source:
  - path: "src/monitor.js"
    line: 329
    end_line: 447
apis:
  - protocol: rpc
    path: "worldInfoFromNotification(n)"
    description:
      zh: >
          从通知负载中提取世界 id 与名称。
          
      en: >
          Extract a world id and name from a notification payload.
          
  - protocol: rpc
    path: "groupIdFromNotification(n)"
    description:
      zh: >
          从通知负载中提取群组 id。
          
      en: >
          Extract a group id from a notification payload.
          
  - protocol: rpc
    path: "dispatchVrcNotification(user, n, vrcapi)"
    description:
      zh: >
          过滤、富化并推送一条 VRChat 站内通知。
          
      en: >
          Filter, enrich and push a VRChat in-app notification.
          
deps:
  - kind: call
    to: vrcnotifier.data.settings
    label: {zh: "读取类型开关", en: "Read the type switches"}
  - kind: call
    to: vrcnotifier.data.dedupe
    label: {zh: "按通知 id 去重", en: "Dedupe by notification id"}
  - kind: call
    to: vrcnotifier.monitor.group-name
    label: {zh: "解析群名", en: "Resolve the group name"}
  - kind: call
    to: vrcnotifier.qq.notifier
    label: {zh: "发送通知", en: "Send the notification"}
---
