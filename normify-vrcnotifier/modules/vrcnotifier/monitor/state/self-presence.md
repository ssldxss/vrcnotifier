---
uid: 34a6ae9a
id: vrcnotifier.monitor.state.self-presence
parent: vrcnotifier.monitor.state
name: {zh: "自身在线状态落地", en: "Self Presence Persistence"}
description:
  zh: >
      自己的在线状态只入库并推给面板，绝不进入通知链、去重或 pending 逻辑。状态派生刻意把 offline/空位置归为网页在线，因为此时网页会话仍在活动；private、traveling 或 wrld_ 位置表示游戏在线。显式传入的字段优先，缺失字段继承库中旧值。
      
  en: >
      The user's own presence is persisted and pushed to the panel but never enters the notification chain, dedupe or pending logic. The state derivation deliberately maps an offline or empty location to web-online, because the web session is still active in that case; a private, traveling or wrld_ location means in-game online. Explicit incoming fields win, missing ones inherit the stored value.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:58.166Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
    line: 621
    end_line: 658
apis:
  - protocol: rpc
    path: "deriveSelfState(location, apiState)"
    description:
      zh: >
          把位置与 API 状态归一为自身在线状态。
          
      en: >
          Normalize a location and API state into the self presence state.
          
  - protocol: rpc
    path: "applySelfInput(user, input)"
    description:
      zh: >
          落地自身在线状态并通知面板。
          
      en: >
          Persist self presence and notify the panel.
          
deps:
  - kind: call
    to: vrcnotifier.data.users
    label: {zh: "写入自身状态", en: "Write self presence"}
---
