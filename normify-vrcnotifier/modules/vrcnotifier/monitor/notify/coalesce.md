---
uid: b09c602a
id: vrcnotifier.monitor.notify.coalesce
parent: vrcnotifier.monitor.notify
name: {zh: "连续变化合并", en: "Merging Rapid Changes"}
description:
  zh: >
      同一个人先改状态、紧跟着又换世界时，把两条合成一条发。
      
  en: >
      When someone changes status and then switches world within a moment, merges the two into one message.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.880Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
source:
  - path: "src/monitor.js"
    line: 449
    end_line: 482
apis:
  - protocol: rpc
    path: "eventTypeFor(changeType)"
    description:
      zh: >
          把中文变更类型映射为消费方使用的事件类型。
          
      en: >
          Map a Chinese change type to the event type used by consumers.
          
  - protocol: rpc
    path: "dispatchChange(user, friendVrcId, change, eventType)"
    description:
      zh: >
          短暂延迟状态变化，让紧随的切世界合并成一条。
          
      en: >
          Delay a status change briefly so an immediate world switch can merge into one message.
          
deps:
  - kind: call
    to: vrcnotifier.monitor.notify.change-dispatch
    label: {zh: "交付合并后的变更", en: "Hand off the merged change"}
---
