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
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.268Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
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
