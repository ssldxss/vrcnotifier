---
uid: "882218e0"
id: vrcnotifier.monitor.state
parent: vrcnotifier.monitor
name: {zh: "状态保存", en: "State Persistence"}
description:
  zh: >
      把看到的情况写进数据库：好友的，还有你自己的。
      
  en: >
      Writes what was observed into the database — your friends' state and your own.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.886Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
source:
  - path: "src/monitor.js"
deps:
  - kind: call
    to: vrcnotifier.monitor.state.friend-apply
    label: {zh: "好友写入入口", en: "Friend write funnel"}
  - kind: call
    to: vrcnotifier.monitor.state.self-presence
    label: {zh: "自身状态", en: "Self presence"}
  - kind: call
    to: vrcnotifier.monitor.state.pending-verification
    label: {zh: "下线确认", en: "Offline confirmation"}
  - kind: call
    to: vrcnotifier.monitor.notify
    label: {zh: "确认后通知", en: "Notifies after confirming"}
---
