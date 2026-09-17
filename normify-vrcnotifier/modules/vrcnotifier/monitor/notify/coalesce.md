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
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:39.661Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
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
