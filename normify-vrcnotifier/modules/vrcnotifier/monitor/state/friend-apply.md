---
uid: 1ae9f165
id: vrcnotifier.monitor.state.friend-apply
parent: vrcnotifier.monitor.state
name: {zh: "好友数据保存", en: "Friend Input Persistence"}
description:
  zh: >
      好友信息进数据库的唯一入口，变化与否也在这里判断。
      
  en: >
      The only way friend data reaches the database, and where it decides whether anything really changed.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.684Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
    line: 575
    end_line: 619
apis:
  - protocol: rpc
    path: "applyFriendInput(user, friendVrcId, input, opts)"
    description:
      zh: >
          全部好友数据的唯一写库入口。
          
      en: >
          The single write path for all friend data.
          
deps:
  - kind: call
    to: vrcnotifier.data.friends
    label: {zh: "写入好友行", en: "Write friend rows"}
  - kind: call
    to: vrcnotifier.data.friend-state.apply
    label: {zh: "差分状态转移", en: "Diff the transition"}
  - kind: call
    to: vrcnotifier.monitor.notify.coalesce
    label: {zh: "分发变更", en: "Dispatch the change"}
  - kind: call
    to: vrcnotifier.vrc.world.cache
    label: {zh: "同步取旧世界名", en: "Peek the old world name"}
---
