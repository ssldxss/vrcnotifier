---
uid: b09c602a
id: vrcnotifier.monitor.notify.coalesce
parent: vrcnotifier.monitor.notify
name: {zh: "变更类型映射与合并", en: "Change Type Mapping & Coalescing"}
description:
  zh: >
      把“发生了什么变化”与“怎么报出去”分开。来自 friend-update 的状态变化先压合并窗口；若窗口内同好友的 friend-location 到达且新状态相同，则补回被压的旧状态并把两条并作一条发出，否则窗口到期后单独推送。eventTypeFor 为每种变更类型给出稳定的机器可读事件名。
      
  en: >
      Separates 'what changed' from 'how it is reported'. A status change arriving from friend-update is held for the coalescing window; if a friend-location for the same friend arrives inside that window with the same new status, the held old status is restored and the two are emitted as one message, otherwise the timer fires and the status change goes out alone. eventTypeFor gives each change type a stable machine-readable event name.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:10.935Z"
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
    from_api: "rpc:dispatchChange(user, friendVrcId, change, eventType)"
    to_api: "rpc:dispatchNotification(user, friendVrcId, change)"
    label: {zh: "交付合并后的变更", en: "Hand off the merged change"}
---
