---
uid: 34a6ae9a
id: vrcnotifier.monitor.state.self-presence
parent: vrcnotifier.monitor.state
name: {zh: "自身在线状态保存", en: "Self Presence Persistence"}
description:
  zh: >
      记录你自己的在线状态，只给面板看，不给你发通知。
      
  en: >
      Records your own presence for the panel only — it never triggers a notification.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.886Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
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
          保存自身在线状态并通知面板。
          
      en: >
          Persist self presence and notify the panel.
          
deps:
  - kind: call
    to: vrcnotifier.data.users
    label: {zh: "写入自身状态", en: "Write self presence"}
---
