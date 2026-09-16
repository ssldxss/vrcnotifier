---
uid: 0119aacd
id: vrcnotifier.monitor.notify.change-dispatch
parent: vrcnotifier.monitor.notify
name: {zh: "好友变更分发与去重", en: "Friend Change Dispatch & Dedupe"}
description:
  zh: >
      好友变更通知的唯一收口。没有总开关：每条变更自带要检查的 notifyField，新好友默认全关。去重 key 包含新旧状态与世界，避免同一好友的不同变化被吞掉；未命中则落标记，补齐名称/头像/事件类型与本地时间戳后发送并发出 notification 事件。
      
  en: >
      The single funnel for friend-change notifications. There is no global switch: each change carries the notifyField to check on the friend row, and newly added friends default to all-off. The dedupe key includes old and new status as well as the world so distinct transitions for the same friend are not swallowed; on a miss it marks the key, then fills in name, avatar, event type and local timestamp before sending and emitting the notification event.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:10.935Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
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
    from_api: "rpc:dispatchNotification(user, friendVrcId, change)"
    to_api: "rpc:getFriend(friendVrcId)"
    label: {zh: "读取通知开关", en: "Read the notify flags"}
  - kind: call
    to: vrcnotifier.data.dedupe
    from_api: "rpc:dispatchNotification(user, friendVrcId, change)"
    to_api: "rpc:isDuplicate(key, windowMs, atMs)"
    label: {zh: "按变更键去重", en: "Dedupe by change key"}
  - kind: call
    to: vrcnotifier.qq.notifier
    from_api: "rpc:dispatchNotification(user, friendVrcId, change)"
    to_api: "rpc:sendAll(user, change)"
    label: {zh: "发送变更", en: "Send the change"}
---
