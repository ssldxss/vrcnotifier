---
uid: 43cd7cf3
id: vrcnotifier.web.sdk
parent: vrcnotifier.web
name: {zh: "客户端库", en: "Client Library"}
description:
  zh: >
      可选的客户端库：别的前端项目也能用同一套接口。
      
  en: >
      An optional client library, so another front end can talk to the same backend.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.311Z"
fingerprint: d1a019f2ed4563bc5f3e5b961e9f27b28ffa1fbe27d5dd7e97547e24ddfe21ef
source:
  - path: "public/sdk.js"
    line: 1
    end_line: 179
apis:
  - protocol: rpc
    path: "new Client(opts)"
    description:
      zh: >
          构造客户端，解析后端地址、令牌与存储。
          
      en: >
          Construct a client, resolving base URL, token and storage.
          
  - protocol: rpc
    path: "Client.request(method, path, opts)"
    description:
      zh: >
          发起带鉴权的请求，非 2xx 抛 ApiError。
          
      en: >
          Perform an authenticated request, raising ApiError on non-2xx.
          
  - protocol: rpc
    path: "Client.subscribeEvents(handlers)"
    description:
      zh: >
          订阅后端 SSE 流并按命名事件分发。
          
      en: >
          Subscribe to the backend SSE stream with named-event dispatch.
          
  - protocol: rpc
    path: "Client.avatarUrl(key)"
    description:
      zh: >
          构造携带令牌的头像 URL。
          
      en: >
          Build a token-carrying avatar URL.
          
---
