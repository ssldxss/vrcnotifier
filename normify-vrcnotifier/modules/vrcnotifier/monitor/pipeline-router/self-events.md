---
uid: 6df7aa7e
id: vrcnotifier.monitor.pipeline-router.self-events
parent: vrcnotifier.monitor.pipeline-router
name: {zh: "自己的消息处理", en: "Your Own Messages"}
description:
  zh: >
      你自己改资料或换房间时的处理。
      
  en: >
      Handles your own profile changes and world switches.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.683Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
    line: 752
    end_line: 787
apis:
  - protocol: rpc
    path: "handleSelfEvent(user, type, content)"
    description:
      zh: >
          把 user-update 与 user-location 映射为自身在线状态输入。
          
      en: >
          Map user-update and user-location onto self presence input.
          
deps:
  - kind: call
    to: vrcnotifier.monitor.state.self-presence
    label: {zh: "保存自身状态", en: "Persist self presence"}
  - kind: call
    to: vrcnotifier.data.location
    label: {zh: "解析位置标签", en: "Parse the location tag"}
  - kind: call
    to: vrcnotifier.monitor.world-name
    label: {zh: "解析世界名", en: "Resolve world names"}
---
