---
uid: 755883fd
id: vrcnotifier.vrc.pipeline.connection
parent: vrcnotifier.vrc.pipeline
name: {zh: "连接与重连保活", en: "Connection & Reconnect Lifecycle"}
description:
  zh: >
      建立并维持连接；断了就重连，越连不上间隔越长。
      
  en: >
      Opens and keeps the connection; if it drops it reconnects, waiting longer each time.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.912Z"
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
          下一次重连的时间一次比一次等得久，并加一点随机。
          
      en: >
          Wait longer before each reconnect, with a little randomness.
          
  - protocol: rpc
    path: "startPing(conn)"
    description:
      zh: >
          启动协议 ping，并在收不到 pong 时断开卡住的连接。
          
      en: >
          Start the protocol ping with a pong watchdog terminating zombie sockets.
          
  - protocol: rpc
    path: "maybeNotifyFailure(userId, conn)"
    description:
      zh: >
          断线时间超过上限后升级到故障回调。
          
      en: >
          Escalate to the failure callback once a disconnect window exceeds the threshold.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.pipeline.frames
    label: {zh: "解析与串行处理帧", en: "Parse and serialize frames"}
  - kind: call
    to: vrcnotifier.vrc.pipeline.stats
    label: {zh: "消息计数", en: "Count messages"}
---
