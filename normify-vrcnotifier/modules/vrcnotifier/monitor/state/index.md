---
uid: "882218e0"
id: vrcnotifier.monitor.state
parent: vrcnotifier.monitor
name: {zh: "状态落地", en: "State Persistence"}
description:
  zh: >
      从输入到落库之间的全部逻辑：好友写入唯一入口、自身在线状态写入入口，以及把怀疑下线批量复核确认的流程。
      
  en: >
      Everything between an input and the database: the friend write funnel, the self-presence write funnel and the batched verification that confirms a suspected offline.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:58.166Z"
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
---
