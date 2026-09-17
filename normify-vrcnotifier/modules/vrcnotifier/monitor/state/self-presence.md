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
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.685Z"
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
          保存自身在线状态并通知面板。
          
      en: >
          Persist self presence and notify the panel.
          
deps:
  - kind: call
    to: vrcnotifier.data.users
    label: {zh: "写入自身状态", en: "Write self presence"}
---
