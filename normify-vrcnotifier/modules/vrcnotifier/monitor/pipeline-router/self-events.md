---
uid: 6df7aa7e
id: vrcnotifier.monitor.pipeline-router.self-events
parent: vrcnotifier.monitor.pipeline-router
name: {zh: "自身事件映射", en: "Self Event Mapping"}
description:
  zh: >
      处理两个指向自己的事件类型。user-update 只带资料字段与社交状态；user-location 带完整用户对象与位置：状态由位置派生，offline 或空状态归为 active，private 或 traveling 位置沿用已知的旧世界，避免瞬时标签把界面清空。
      
  en: >
      Handles the two self-directed event types. user-update carries only profile fields and a social status, while user-location carries a full user object and a location: the state is derived from the location, an offline or empty status is normalized to active, and private or traveling locations keep the previously known world so a transient tag never blanks the UI.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:58.166Z"
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
    label: {zh: "落地自身状态", en: "Persist self presence"}
  - kind: call
    to: vrcnotifier.data.location
    label: {zh: "解析位置标签", en: "Parse the location tag"}
  - kind: call
    to: vrcnotifier.monitor.world-name
    label: {zh: "解析世界名", en: "Resolve world names"}
---
