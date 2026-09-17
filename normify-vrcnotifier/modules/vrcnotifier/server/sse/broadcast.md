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
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.904Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
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
