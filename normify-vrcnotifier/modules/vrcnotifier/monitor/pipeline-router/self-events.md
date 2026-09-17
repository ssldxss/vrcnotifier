---
uid: 6df7aa7e
id: vrcnotifier.monitor.pipeline-router.self-events
parent: vrcnotifier.monitor.pipeline-router
name: {zh: "自己的消息处理", en: "Your Own Messages"}
description:
  zh: >
      你自己改资料或换房间时的处理。这两个分支在 handlePipelineEvent 的 switch 里内联实现，没有独立的处理函数。
      
  en: >
      Handles your own profile changes and world switches. Both cases are inline in handlePipelineEvent's switch; there is no dedicated handler function.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.883Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
source:
  - path: "src/monitor.js"
    line: 752
    end_line: 787
apis:
  - protocol: ws
    path: "user-update"
    description:
      zh: >
          自己资料变化（昵称/头像/状态），带完整 user 对象。
          
      en: >
          Own profile change (name/avatar/status) carrying a full user object.
          
  - protocol: ws
    path: "user-location"
    description:
      zh: >
          自己换房间；offline 或空位置按网页在线处理。
          
      en: >
          Own world switch; an offline or empty location is treated as web-online.
          
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
