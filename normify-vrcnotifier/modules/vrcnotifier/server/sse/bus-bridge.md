---
uid: b51b11dd
id: vrcnotifier.server.sse.bus-bridge
parent: vrcnotifier.server.sse
name: {zh: "事件总线桥接与 WS 统计", en: "Bus to SSE Bridge & WS Stats"}
description:
  zh: >
      把程序内部发生的事情，转成浏览器能收到的事件。
      
  en: >
      Turns things happening inside the program into events the browser can receive.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.905Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
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
