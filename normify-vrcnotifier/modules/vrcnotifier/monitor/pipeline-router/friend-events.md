---
uid: 022af837
id: vrcnotifier.monitor.pipeline-router.friend-events
parent: vrcnotifier.monitor.pipeline-router
name: {zh: "好友消息处理", en: "Friend Messages"}
description:
  zh: >
      好友的七种消息分别怎么处理：上线、下线、换世界、改资料等。
      
  en: >
      How each of the seven friend messages is handled: coming online, going offline, changing world, editing a profile and so on.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.682Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
    line: 683
    end_line: 751
  - path: "src/monitor.js"
    line: 788
    end_line: 810
apis:
  - protocol: rpc
    path: "handleFriendEvent(user, type, content)"
    description:
      zh: >
          把好友上线/活动/下线/切世界/资料/新增/删除映射为好友状态输入。
          
      en: >
          Map friend-online/active/offline/location/update/add/delete onto friend state input.
          
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
