---
uid: 1ae9f165
id: vrcnotifier.monitor.state.friend-apply
parent: vrcnotifier.monitor.state
name: {zh: "好友输入落地", en: "Friend Input Persistence"}
description:
  zh: >
      好友数据入库的唯一入口。首见好友直接按现状插入，不比较也不通知；否则先更新资料字段，再由状态机差分在线字段。把结果 dbUpdate 连同实例号（undefined 时保留旧值）与 last_seen 一起写库，据此排期或清理 pending 定时器；只有状态机判定要通知且调用方未要求静默时才发通知——首次对账传 silent，只建基线。
      
  en: >
      The one place friend data reaches the database. A first-seen friend is inserted as-is with no comparison and no notification; otherwise profile fields are updated and the state machine diffs presence. The resulting update, instance id and last_seen are stored, the pending timer is armed or cleared, and notifications go out only when the state machine agrees and the caller did not ask for silence.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:10.934Z"
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
    from_api: "rpc:applyFriendInput(user, friendVrcId, input, opts)"
    to_api: "rpc:updateFriendState(id, fields)"
    label: {zh: "写入好友行", en: "Write friend rows"}
  - kind: call
    to: vrcnotifier.data.friend-state.apply
    from_api: "rpc:applyFriendInput(user, friendVrcId, input, opts)"
    to_api: "rpc:applyChange(prevDb, incoming, opts)"
    label: {zh: "差分状态转移", en: "Diff the transition"}
  - kind: call
    to: vrcnotifier.monitor.notify.coalesce
    from_api: "rpc:applyFriendInput(user, friendVrcId, input, opts)"
    to_api: "rpc:dispatchChange(user, friendVrcId, change, eventType)"
    label: {zh: "分发变更", en: "Dispatch the change"}
  - kind: call
    to: vrcnotifier.vrc.world.cache
    from_api: "rpc:applyFriendInput(user, friendVrcId, input, opts)"
    to_api: "rpc:peek(worldId)"
    label: {zh: "同步取旧世界名", en: "Peek the old world name"}
---
