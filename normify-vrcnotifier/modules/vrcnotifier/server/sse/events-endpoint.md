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
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:19.393Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
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
