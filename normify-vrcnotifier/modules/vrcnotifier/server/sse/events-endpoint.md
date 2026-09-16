---
uid: d125c659
id: vrcnotifier.server.sse.events-endpoint
parent: vrcnotifier.server.sse
name: {zh: "SSE 事件端点", en: "SSE Events Endpoint"}
description:
  zh: >
      唯一的长连接端点。写入 text/event-stream 头（并关闭代理缓冲），先发 : connected 注释帧，把响应登记进客户端集，用 25 秒 : ping 注释保活，请求关闭时清理定时器与集合项。不发 id/retry 字段——断线补缺口由客户端调 /api/logs?after=seq 完成。
      
  en: >
      The only streaming endpoint. Writes the text/event-stream headers (with X-Accel-Buffering disabled for proxies), sends a leading : connected comment, registers the response in the client set, keeps it alive with a 25-second : ping comment, and cleans up the interval and set entry when the request closes. No id/retry fields are emitted — gap filling is client-driven through /api/logs?after=seq.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:44.403Z"
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
