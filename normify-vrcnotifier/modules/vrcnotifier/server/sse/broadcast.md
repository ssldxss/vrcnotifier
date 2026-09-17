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
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:19.393Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
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
