---
uid: d125c659
id: vrcnotifier.server.sse.events-endpoint
parent: vrcnotifier.server.sse
name: {zh: "SSE 事件端点", en: "SSE Events Endpoint"}
description:
  zh: >
      浏览器订阅实时事件的地址；空闲时也会定时打个招呼，避免连接被断开。
      
  en: >
      The address the browser subscribes to; it sends a small ping so the connection is not dropped while idle.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.905Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
source:
  - path: "src/server.js"
    line: 1044
    end_line: 1061
apis:
  - protocol: http
    method: GET
    path: "/api/events"
    description:
      zh: >
          开启 SSE 流：先发连接注释帧，之后每 25 秒 ping 保活。
          
      en: >
          Open the SSE stream with an initial comment frame and a 25s ping heartbeat.
          
deps:
  - kind: call
    to: vrcnotifier.server.sse.broadcast
    label: {zh: "登记客户端", en: "Register the client"}
---
