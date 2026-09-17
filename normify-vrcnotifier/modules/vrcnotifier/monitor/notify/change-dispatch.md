---
uid: 0119aacd
id: vrcnotifier.monitor.notify.change-dispatch
parent: vrcnotifier.monitor.notify
name: {zh: "好友变更分发与去重", en: "Friend Change Dispatch & Dedupe"}
description:
  zh: >
      好友状态变了：先看这个好友有没有开通知、是不是刚发过，然后才发。
      
  en: >
      A friend changed state: check that this friend has notifications on and that one was not just sent, then send.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.880Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
source:
  - path: "src/monitor.js"
    line: 303
    end_line: 327
apis:
  - protocol: rpc
    path: "dispatchNotification(user, friendVrcId, change)"
    description:
      zh: >
          按逐好友开关把关、去重、补全并发送一条好友变更。
          
      en: >
          Gate on the per-friend flag, dedupe, enrich and send one friend change.
          
deps:
  - kind: call
    to: vrcnotifier.data.friends
    label: {zh: "读取通知开关", en: "Read the notify flags"}
  - kind: call
    to: vrcnotifier.data.dedupe
    label: {zh: "按变更键去重", en: "Dedupe by change key"}
  - kind: call
    to: vrcnotifier.qq.notifier
    label: {zh: "发送变更", en: "Send the change"}
---
