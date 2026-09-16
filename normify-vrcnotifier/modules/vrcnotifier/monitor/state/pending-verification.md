---
uid: de71d171
id: vrcnotifier.monitor.state.pending-verification
parent: vrcnotifier.monitor.state
name: {zh: "下线待定批量确认", en: "Offline Pending Verification"}
description:
  zh: >
      针对疑似下线的防闪烁确认。同一账号的全部 pending 好友共享一个定时器与一次 me() 调用；到期点取“最后到达加确认延迟”与“最早 pending 加两倍延迟”的较小值，既能把突发合并成一次请求，又保证持续下线流不会把验证饿死。到期后重读三个在线状态数组判定是否真离线；名册中查无此人则视为已删好友并删行。
      
  en: >
      Anti-flicker confirmation for suspected disconnects: all pending friends of one account share one timer and one me() call, so a burst collapses into a single request while a continuous offline stream never starves verification. On expiry the three presence arrays decide whether the friend is really offline, and an absent roster entry means a removed friend whose row is deleted.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:58.166Z"
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
          取消某个好友的 pending 校验。
          
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
