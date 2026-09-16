---
uid: b51b11dd
id: vrcnotifier.server.sse.bus-bridge
parent: vrcnotifier.server.sse
name: {zh: "事件总线桥接与 WS 统计", en: "Bus to SSE Bridge & WS Stats"}
description:
  zh: >
      订阅监控事件总线并把领域事件转发到浏览器：snapshot、notification、world-name、session-expired、ws-failure、sync-progress（改名 login-progress）、ws-open/ws-close、self-state、qq-status 与 health，其中若干同时重发聚合状态。另有每秒 ticker 补推最近 3 秒的 WS 消息数，无客户端时直接跳过。
      
  en: >
      Subscribes to the monitor event bus and re-emits each domain event to the browser: snapshot, notification, world-name, session-expired, ws-failure, sync-progress (as login-progress), ws-open/ws-close, self-state, qq-status and health, several of which also re-broadcast the aggregate status payload. A one-second ticker additionally pushes the last three seconds of WS message counts with no clients skipped.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:44.403Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
    line: 561
    end_line: 615
  - path: "src/server.js"
    line: 617
    end_line: 629
apis:
  - protocol: rpc
    path: "bridgeBusEvents(bus, broadcast)"
    description:
      zh: >
          把后端总线事件映射为 SSE 事件并重发状态。
          
      en: >
          Map backend bus events onto SSE events and status re-broadcasts.
          
  - protocol: rpc
    path: "wsStatsTicker()"
    description:
      zh: >
          每秒补推最近几秒的 WS 消息数。
          
      en: >
          Push the last seconds of WS message counts every second.
          
deps:
  - kind: event
    to: vrcnotifier.monitor.core
    label: {zh: "订阅监控事件", en: "Subscribe to monitor events"}
  - kind: call
    to: vrcnotifier.vrc.pipeline.stats
    label: {zh: "推送 WS 消息数", en: "Push WS message counts"}
---
