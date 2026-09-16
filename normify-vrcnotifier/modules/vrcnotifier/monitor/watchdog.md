---
uid: 684ee2fb
id: vrcnotifier.monitor.watchdog
parent: vrcnotifier.monitor
name: {zh: "WS 静默看门狗", en: "WS Silence Watchdog"}
description:
  zh: >
      VRChat 管线除协议层 ping 外没有应用层心跳，因此用“沉默”判断存活：已连接但最后一条消息早于 watchdog 窗口的用户会被强制重连，而重连路径会先对账再处理新消息。看门狗只触发重连，绝不自行翻转在线状态。
      
  en: >
      VRChat's pipeline protocol has no application-level heartbeat beyond the protocol ping, so liveness is judged by silence: any connected user whose last message is older than the watchdog window is force-reconnected, and the reconnect path then reconciles before processing new messages. The watchdog only triggers reconnection, it never flips presence state itself.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:10.935Z"
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
    from_api: "rpc:runWatchdog()"
    to_api: "rpc:forceReconnect(userId)"
    label: {zh: "强制重连", en: "Force reconnect"}
---
