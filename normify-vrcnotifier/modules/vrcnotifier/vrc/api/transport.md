---
uid: b2e7cee1
id: vrcnotifier.vrc.api.transport
parent: vrcnotifier.vrc.api
name: {zh: "发请求与重试", en: "Sending & Retrying"}
description:
  zh: >
      真正发请求的地方：控制请求频率，遇到临时故障会重试。
      
  en: >
      Where requests are actually sent: keeps the request rate in check, and retries temporary failures.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.908Z"
fingerprint: 41550317630bd0c2e6ca7b19edbe553bad6fd8b8e48ed4f731379e1a8333b2ec
source:
  - path: "src/vrcapi.js"
    line: 14
    end_line: 106
  - path: "src/vrcapi.js"
    line: 185
    end_line: 193
apis:
  - protocol: rpc
    path: "request(path, opts)"
    description:
      zh: >
          带 cookie 处理、限流与退避地发起一次请求。
          
      en: >
          Issue one request with cookie handling, rate limiting and backoff.
          
  - protocol: rpc
    path: "attemptRequest(path, opts)"
    description:
      zh: >
          执行真正的 fetch，吸收 Set-Cookie 并抛出 ApiError。
          
      en: >
          Perform the fetch, absorb Set-Cookie and raise ApiError.
          
  - protocol: rpc
    path: "isMissingCredentials(e)"
    description:
      zh: >
          判断是否为凭据缺失类 401。
          
      en: >
          Classify a 401 as missing credentials.
          
  - protocol: rpc
    path: "isUnauthorized(e)"
    description:
      zh: >
          判断是否为会话挂起类 401。
          
      en: >
          True when the error is a suspended-session 401.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.cookiejar
    label: {zh: "读写 cookie", en: "Attach and absorb cookies"}
---
