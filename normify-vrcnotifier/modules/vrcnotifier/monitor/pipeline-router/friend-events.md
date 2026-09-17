---
uid: 022af837
id: vrcnotifier.monitor.pipeline-router.friend-events
parent: vrcnotifier.monitor.pipeline-router
name: {zh: "好友消息处理", en: "Friend Messages"}
description:
  zh: >
      好友的七种消息分别怎么处理：上线、活动、下线、换世界、改资料、加好友、删好友。这些分支在 handlePipelineEvent 的 switch 里内联实现，没有独立的处理函数；除 friend-offline 外每个分支都带 user 对象。
      
  en: >
      How each of the seven friend messages is handled: online, active, offline, world change, profile edit, add and delete. The branches are inline in handlePipelineEvent's switch, with no dedicated handler function; every case but friend-offline carries a user object.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:24:09.513Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
source:
  - path: "src/monitor.js"
    line: 683
    end_line: 751
  - path: "src/monitor.js"
    line: 788
    end_line: 810
apis:
  - protocol: ws
    path: "friend-online"
    description:
      zh: >
          好友上线（或从网页端转入游戏），带 user 对象与世界位置。
          
      en: >
          A friend came online (or moved from web into the game); carries a user object and a world location.
          
  - protocol: ws
    path: "friend-active"
    description:
      zh: >
          好友变为网页在线，无世界信息。
          
      en: >
          A friend became web-active; no world information.
          
  - protocol: ws
    path: "friend-offline"
    description:
      zh: >
          好友下线；不带 user 对象，只更新在线状态并清空世界。
          
      en: >
          A friend went offline; carries no user object, only clears presence and world.
          
  - protocol: ws
    path: "friend-location"
    description:
      zh: >
          好友换房间；traveling 时保留旧世界名与实例号。
          
      en: >
          A friend switched world; a traveling state keeps the previous world name and instance.
          
  - protocol: ws
    path: "friend-update"
    description:
      zh: >
          好友改资料（昵称/头像/状态）；字段缺失时继承旧值。
          
      en: >
          A friend edited their profile (name/avatar/status); missing fields inherit the old value.
          
  - protocol: ws
    path: "friend-add"
    description:
      zh: >
          新增好友。location 只在事件信封里（WS 的 user 对象没有该字段），所以在线状态、世界与平台都从信封加 last_platform 推导。
          
      en: >
          A friend was added. location lives only in the event envelope (the WS user object has no such field), so presence, world and platform are derived from the envelope plus last_platform.
          
  - protocol: ws
    path: "friend-delete"
    description:
      zh: >
          删除好友行，并清理它的待验证状态。
          
      en: >
          Removes the friend row and clears its pending-verification state.
          
deps:
  - kind: call
    to: vrcnotifier.monitor.state.friend-apply
    label: {zh: "保存好友数据", en: "Persist the friend input"}
  - kind: call
    to: vrcnotifier.data.location
    label: {zh: "解析位置标签", en: "Parse the location tag"}
  - kind: call
    to: vrcnotifier.monitor.world-name
    label: {zh: "解析世界名", en: "Resolve world names"}
  - kind: call
    to: vrcnotifier.data.friends
    label: {zh: "删除已删好友", en: "Delete removed friends"}
---
