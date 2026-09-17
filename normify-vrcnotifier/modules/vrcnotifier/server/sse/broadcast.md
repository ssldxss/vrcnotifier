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
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.288Z"
fingerprint: 0b01f6faa64e00266c421863adc31d67ecfabe46ed5db86e0fd44a724e285305
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
