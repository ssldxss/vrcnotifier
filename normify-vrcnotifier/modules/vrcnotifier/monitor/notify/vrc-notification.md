---
uid: 034a8075
id: vrcnotifier.monitor.notify.vrc-notification
parent: vrcnotifier.monitor.notify
name: {zh: "站内通知解析与推送", en: "VRChat Notification Parsing & Dispatch"}
description:
  zh: >
      处理 VRChat 站内通知并复用同一通知渠道，但只放行三类：世界邀请、戳一戳与群组公告。类型开关读全局设置，且必须在去重标记之前判定，否则“关掉再打开”会补推积压；自己发出的通知丢弃；邀请类从其负载提取世界（details 在 REST 下是 JSON 字符串、WS 下是对象），公告类提取群组并用群名作为发送者展示。
      
  en: >
      Handles VRChat in-app notifications and reuses the same notification channels, but only for three kinds: world invites, boops and group announcements. Type switches come from global settings and are consulted before the dedupe mark so turning a switch off then on cannot replay a backlog; self-sent notifications are dropped; invite payloads have their world extracted (details may be a JSON string over REST or an object over WS) and announcements their group, whose name replaces the sender.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:58.166Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
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
