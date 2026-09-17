---
uid: 1ae9f165
id: vrcnotifier.monitor.state.friend-apply
parent: vrcnotifier.monitor.state
name: {zh: "好友数据保存", en: "Friend Input Persistence"}
description:
  zh: >
      好友信息进数据库的唯一入口，变化与否也在这里判断。资料字段缺失时整段跳过更新，所以缺失的值不会覆盖已存的值。
      
  en: >
      The single entry point through which friend data reaches the database, and where it decides whether anything really changed. When a profile field is absent the update is skipped entirely, so a missing value never overwrites a stored one.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:24:09.513Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
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
