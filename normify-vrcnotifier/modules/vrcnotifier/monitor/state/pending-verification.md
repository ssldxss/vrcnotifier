---
uid: de71d171
id: vrcnotifier.monitor.state.pending-verification
parent: vrcnotifier.monitor.state
name: {zh: "下线确认", en: "Confirming Offline"}
description:
  zh: >
      刚看到好友下线时先不急着通知，过一会儿再确认一次，避免网络波动误报。
      
  en: >
      Does not announce a friend going offline right away; confirms again a moment later so a network hiccup is not reported as real.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.684Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
    line: 484
    end_line: 573
apis:
  - protocol: rpc
    path: "schedulePendingCheck(user, friendVrcId)"
    description:
      zh: >
          为好友排期或顺延共享的下线确认定时器。
          
      en: >
          Schedule or refresh the shared offline-confirmation timer for a friend.
          
  - protocol: rpc
    path: "resolvePendingAll(user, friendIds)"
    description:
      zh: >
          用一次 me() 复核该用户的全部 pending 好友。
          
      en: >
          Verify all pending friends for a user with a single me() call.
          
  - protocol: rpc
    path: "clearPendingCheck(user, friendVrcId)"
    description:
      zh: >
          取消某个好友的待确认检查。
          
      en: >
          Cancel the pending check for a friend.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.api.auth
    label: {zh: "重读在线状态", en: "Re-read presence"}
  - kind: call
    to: vrcnotifier.monitor.state.friend-apply
    label: {zh: "重回状态机", en: "Re-enter the state machine"}
  - kind: call
    to: vrcnotifier.data.friends
    label: {zh: "删除已删好友", en: "Delete removed friends"}
---
