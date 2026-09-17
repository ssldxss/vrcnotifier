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
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.274Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
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
