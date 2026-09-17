---
uid: df5ae1d4
id: vrcnotifier.monitor.notify
parent: vrcnotifier.monitor
name: {zh: "通知分发", en: "Notification Dispatch"}
description:
  zh: >
      决定哪些消息真的发给你，以及长什么样。
      
  en: >
      Decides which messages actually reach you, and what they look like.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-17T00:14:58.620Z"
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
    label: {zh: "合并与发送", en: "Merge and send"}
  - kind: call
    to: vrcnotifier.monitor.group-name
    label: {zh: "查群名", en: "Looks up group names"}
---
