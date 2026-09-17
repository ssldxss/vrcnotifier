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
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-17T00:14:58.618Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
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
