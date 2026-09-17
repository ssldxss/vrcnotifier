---
uid: 5882372b
id: vrcnotifier.server.sse.broadcast
parent: vrcnotifier.server.sse
name: {zh: "SSE 广播与日志转发", en: "SSE Broadcast & Log Forwarding"}
description:
  zh: >
      把一条消息同时发给所有打开的面板；发给谁失败就把他去掉。
      
  en: >
      Sends one message to every open page, and drops any page that fails to receive it.
      
revision: 930418f49d1a47dbbb3be7908060037f3d8dfdac
updated_at: "2026-09-17T06:14:56.795Z"
fingerprint: c6db8c1bef3c17e3fc24d177824020b0d73f7c641dbcc2e7a715555db2840ffb
source:
  - path: "src/server.js"
    line: 65
    end_line: 65
  - path: "src/server.js"
    line: 150
    end_line: 170
apis:
  - protocol: rpc
    path: "sseSend(res, event, data)"
    description:
      zh: >
          向单个客户端写一帧 event/data。
          
      en: >
          Write one event/data frame to a client.
          
  - protocol: rpc
    path: "broadcast(event, data)"
    description:
      zh: >
          向全部客户端广播事件，失败即摘除。
          
      en: >
          Broadcast an event to all clients, evicting failures.
          
  - protocol: rpc
    path: "subscribeLogStream(stream)"
    description:
      zh: >
          把每条后端日志转发为 log 或 log-update。
          
      en: >
          Forward every backend log line as log or log-update.
          
deps:
  - kind: call
    to: vrcnotifier.infra.logging.memory-stream
    label: {zh: "订阅日志流", en: "Subscribe to log stream"}
---
