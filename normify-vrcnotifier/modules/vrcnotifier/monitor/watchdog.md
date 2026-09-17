---
uid: 684ee2fb
id: vrcnotifier.monitor.watchdog
parent: vrcnotifier.monitor
name: {zh: "连接静默检测", en: "WS Silence Detection"}
description:
  zh: >
      连接看着还在、但很久没消息了，就主动重连一次。
      
  en: >
      When a connection looks alive but has been silent for too long, reconnects it.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.680Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
    line: 1058
    end_line: 1070
apis:
  - protocol: rpc
    path: "runWatchdog()"
    description:
      zh: >
          对长时间无消息的已连接用户强制重连。
          
      en: >
          Force a reconnect for any connected user whose socket has gone silent.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.pipeline.control
    label: {zh: "强制重连", en: "Force reconnect"}
---
