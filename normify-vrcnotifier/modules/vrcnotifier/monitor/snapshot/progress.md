---
uid: e1fd8bec
id: vrcnotifier.monitor.snapshot.progress
parent: vrcnotifier.monitor.snapshot
name: {zh: "对账进度上报", en: "Reconciliation Progress Reporting"}
description:
  zh: >
      按语义阶段上报登录进度，而不绑定具体 HTTP 请求——密码直登与 2FA 两条路的请求序列不同，绑请求会让等待页错位。好友拉取百分比始终以名册总数为分母累加在线与离线两趟，并在名册拉完后收口到 100%。
      
  en: >
      Reports login progress at semantic stages rather than tied to concrete HTTP requests, because the password and 2FA paths issue a different request sequence and binding to requests would misalign the overlay. The friend-fetch percentage always divides by the roster total, accumulating both the online and offline passes, and is forced to 100% once the roster is exhausted.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:58.166Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
    line: 32
    end_line: 36
  - path: "src/monitor.js"
    line: 902
    end_line: 975
apis:
  - protocol: rpc
    path: "emitProgress(userId, payload)"
    description:
      zh: >
          上报点亮等待页的登录进度阶段。
          
      en: >
          Report the login-progress stage that lights up the boot overlay.
          
deps:
  - kind: event
    to: vrcnotifier.server.sse.bus-bridge
    label: {zh: "推送登录进度", en: "Push login progress"}
---
