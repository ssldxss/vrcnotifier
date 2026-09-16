---
uid: 39b9f5ea
id: vrcnotifier.monitor.pipeline-router.dispatch
parent: vrcnotifier.monitor.pipeline-router
name: {zh: "帧准入与分派", en: "Frame Admission & Dispatch"}
description:
  zh: >
      每一帧在被处理前要过四道检查：会话存在、用户不在等待对账、用户仍在库中、帧带 content。通知生命周期事件（see/hide/response/clear/v2 更新与删除）显式记录并忽略，避免默默落到默认分支；未知类型直接丢弃；整个 switch 外层包 try/catch，单条脏事件不会中断消息流。
      
  en: >
      Every frame passes four checks before it is acted on: a session must exist, the user must not be waiting for a reconciliation, the user must still be in the database, and the frame must carry content. Notification lifecycle events (see, hide, response, clear, v2 update/delete) are explicitly acknowledged and ignored so they cannot silently fall through, unknown types are dropped, and the whole switch is wrapped so one malformed event can never break the stream.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:58.166Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
    line: 669
    end_line: 682
  - path: "src/monitor.js"
    line: 811
    end_line: 832
apis:
  - protocol: rpc
    path: "handlePipelineEvent(userId, raw, parsed)"
    description:
      zh: >
          准入检查、按类型分派与外层异常兜底。
          
      en: >
          Admission checks, per-type dispatch and the outer error guard.
          
deps:
  - kind: call
    to: vrcnotifier.monitor.pipeline-router.friend-events
    label: {zh: "好友事件映射", en: "Friend event mapping"}
  - kind: call
    to: vrcnotifier.monitor.pipeline-router.self-events
    label: {zh: "自身事件映射", en: "Self event mapping"}
  - kind: call
    to: vrcnotifier.monitor.notify.vrc-notification
    label: {zh: "站内通知", en: "In-app notifications"}
---
