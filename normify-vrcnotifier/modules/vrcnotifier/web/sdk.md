---
uid: 43cd7cf3
id: vrcnotifier.web.sdk
parent: vrcnotifier.web
name: {zh: "前端 SDK 客户端", en: "Frontend SDK Client"}
description:
  zh: >
      后端可选客户端库，浏览器中作为全局使用，也可在 Node 中 require。它为 REST 面每个端点提供方法，自动带上 Bearer 令牌，把失败归一为带状态码与负载的类型化错误，并按命名事件订阅 SSE 流。localStorage 不可用时回退到内存 Map，使隐私模式降级而不是直接报错。
      
  en: >
      An optional client library for the backend, usable from the browser as a global or from Node via require. It wraps the REST surface with a method per endpoint, attaches the Bearer token, normalizes failures into a typed error carrying status and payload, and subscribes to the SSE stream by named events. Storage falls back to an in-memory map when localStorage is unavailable, so private-browsing modes degrade instead of throwing.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:30.745Z"
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
