---
uid: df5ae1d4
id: vrcnotifier.monitor.notify
parent: vrcnotifier.monitor
name: {zh: "通知分发", en: "Notification Dispatch"}
description:
  zh: >
      决定什么会真正打扰用户：好友状态变更的逐条去重与分发、VRChat 站内通知的解析与分发，以及把状态变化与紧随其后的切世界合并成一条的窗口。
      
  en: >
      Decides what reaches the user: per-change dedupe and dispatch for friend state changes, parsing and dispatch for VRChat in-app notifications, and the coalescing window that merges a status change with an immediate world switch.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:58.166Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
deps:
  - kind: call
    to: vrcnotifier.monitor.notify.change-dispatch
    label: {zh: "好友变更分发", en: "Friend change dispatch"}
  - kind: call
    to: vrcnotifier.monitor.notify.vrc-notification
    label: {zh: "站内通知", en: "In-app notifications"}
  - kind: call
    to: vrcnotifier.monitor.notify.coalesce
    label: {zh: "合并与发送", en: "Coalesce and send"}
---
