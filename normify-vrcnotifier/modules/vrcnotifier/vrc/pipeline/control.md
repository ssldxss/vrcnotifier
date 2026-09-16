---
uid: f526be6a
id: vrcnotifier.vrc.pipeline.control
parent: vrcnotifier.vrc.pipeline
name: {zh: "连接控制接口", en: "Connection Control API"}
description:
  zh: >
      管理器的对外方法面。forceReconnect 刻意只负责关闭套接字，把通知与重连安排全部交给 close 处理函数，使强制重连与自然断线走同一条路径——否则监控层的连接标志会停在陈旧值，真正的故障反而不会报警。
      
  en: >
      The manager's public surface. forceReconnect deliberately only closes the socket and leaves notification plus rescheduling to the close handler, so a forced reconnect travels the same path as a spontaneous disconnect — otherwise the monitor's connection flag would stay stale and a real outage would go unreported.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:10.935Z"
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
    from_api: "rpc:connect(userId, displayName)"
    to_api: "rpc:connectPipeline(userId, displayName)"
    label: {zh: "驱动连接", en: "Drive the connection"}
  - kind: call
    to: vrcnotifier.vrc.pipeline.stats
    from_api: "rpc:messageRateSeries(nowMs)"
    to_api: "rpc:messageSeries(nowMs)"
    label: {zh: "暴露消息速率", en: "Expose message rate"}
---
