---
uid: 022af837
id: vrcnotifier.monitor.pipeline-router.friend-events
parent: vrcnotifier.monitor.pipeline-router
name: {zh: "好友事件映射", en: "Friend Event Mapping"}
description:
  zh: >
      把七种好友事件翻译为在线状态输入：online 与 location 解析位置标签（真实实例、private 哨兵、traveling 沿用旧世界）并解析世界名；active 代表网页在线且无世界；offline 清空世界/实例/平台但保留社交与自定义状态；update 继承状态，除非负载显式给出否则保留旧实例号；add 按当前位置初始化新好友；delete 删行并取消 pending 校验，不发通知。
      
  en: >
      Translates the seven friend event types into presence input: online and location parse the tag (real instance, private sentinel, traveling keeps the previous world) and resolve a world name; active is web presence with no world; offline clears world, instance and platform but keeps social status; update inherits state; add seeds a new friend; delete removes the row and cancels any pending check without notifying.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:58.166Z"
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
    label: {zh: "落地好友输入", en: "Persist the friend input"}
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
