---
uid: f526be6a
id: vrcnotifier.vrc.pipeline.control
parent: vrcnotifier.vrc.pipeline
name: {zh: "连接控制接口", en: "Connection Control API"}
description:
  zh: >
      连接的开关：连上、断开、强制重连、看状态。
  en: >
      The switch for the connection: open it, close it, force a reconnect, or read its state.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:57.819Z"
fingerprint: fcec1a31e9954f30b8b2af8101c21e657a5bb6faf7760f9cd5cc6094782be79e
source:
  - path: "src/pipeline.js"
    line: 238
    end_line: 287
  - path: "src/pipeline.js"
    line: 265
    end_line: 274
apis:
  - protocol: rpc
    path: "connect(userId, displayName)"
    description:
      zh: >
          连接某个用户（即发即忘包装）。
          
      en: >
          Connect a user (fire-and-forget wrapper).
          
  - protocol: rpc
    path: "disconnect(userId)"
    description:
      zh: >
          主动断开某用户，不再安排重连。
          
      en: >
          Stop a user's connection deliberately so no reconnect is scheduled.
          
  - protocol: rpc
    path: "forceReconnect(userId)"
    description:
      zh: >
          关闭套接字以强制走重连路径。
          
      en: >
          Close the socket to force the reconnect path.
          
  - protocol: rpc
    path: "status(userId)"
    description:
      zh: >
          报告连接状态、尝试次数、故障窗口与最后消息时间。
          
      en: >
          Report connection state, attempts, failure window and last message time.
          
  - protocol: rpc
    path: "messageRateSeries(nowMs)"
    description:
      zh: >
          由管理器暴露的最近 60 秒消息计数。
          
      en: >
          The last 60 seconds of message counts, exposed by the manager.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.pipeline.connection
    label: {zh: "驱动连接", en: "Drive the connection"}
  - kind: call
    to: vrcnotifier.vrc.pipeline.stats
    label: {zh: "暴露消息速率", en: "Expose message rate"}
---
