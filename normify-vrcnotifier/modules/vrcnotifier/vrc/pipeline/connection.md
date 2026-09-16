---
uid: 755883fd
id: vrcnotifier.vrc.pipeline.connection
parent: vrcnotifier.vrc.pipeline
name: {zh: "连接与重连保活", en: "Connection & Reconnect Lifecycle"}
description:
  zh: >
      每用户一条连接的生命周期。VRChat 协议没有应用层心跳，因此存活判断依赖协议 ping 与 pong 超时（超时即终止僵尸连接），以及有界指数退避的重连。持续失败超过阈值的连接只触发一次故障回调；之后成功打开时会标明这是一次恢复，使监控层能区分两者。
      
  en: >
      Connection lifecycle, one connection per user. The VRChat protocol has no application-level heartbeat, so liveness relies on the protocol ping with a pong timeout that terminates zombie sockets, plus reconnection with bounded exponential backoff. A connection failing past the threshold fires the failure callback once, and a later successful open reports itself as a recovery so the monitor can tell the two apart.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:10.935Z"
fingerprint: fcec1a31e9954f30b8b2af8101c21e657a5bb6faf7760f9cd5cc6094782be79e
source:
  - path: "src/pipeline.js"
    line: 56
    end_line: 88
  - path: "src/pipeline.js"
    line: 116
    end_line: 263
apis:
  - protocol: rpc
    path: "connectPipeline(userId, displayName)"
    description:
      zh: >
          建立连接：取令牌、连上、绑定 open/message/close/error。
          
      en: >
          Open the socket: fetch a token, connect, wire open/message/close/error.
          
  - protocol: rpc
    path: "scheduleReconnect(userId, conn)"
    description:
      zh: >
          按指数退避加抖动排期下一次重连。
          
      en: >
          Schedule the next reconnect with exponential backoff and jitter.
          
  - protocol: rpc
    path: "startPing(conn)"
    description:
      zh: >
          启动协议 ping，并用 pong 看门狗终止僵尸连接。
          
      en: >
          Start the protocol ping with a pong watchdog terminating zombie sockets.
          
  - protocol: rpc
    path: "maybeNotifyFailure(userId, conn)"
    description:
      zh: >
          断线窗口超过阈值后升级到故障回调。
          
      en: >
          Escalate to the failure callback once a disconnect window exceeds the threshold.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.pipeline.frames
    from_api: "rpc:connectPipeline(userId, displayName)"
    to_api: "rpc:parseFrame(raw, conn)"
    label: {zh: "解析与串行处理帧", en: "Parse and serialize frames"}
  - kind: call
    to: vrcnotifier.vrc.pipeline.stats
    from_api: "rpc:connectPipeline(userId, displayName)"
    to_api: "rpc:noteMessage(atMs)"
    label: {zh: "消息计数", en: "Count messages"}
---
