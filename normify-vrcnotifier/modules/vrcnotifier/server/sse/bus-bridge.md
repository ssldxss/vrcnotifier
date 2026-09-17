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
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.288Z"
fingerprint: 0b01f6faa64e00266c421863adc31d67ecfabe46ed5db86e0fd44a724e285305
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
