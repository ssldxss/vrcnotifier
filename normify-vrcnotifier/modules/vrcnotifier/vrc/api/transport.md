---
uid: b2e7cee1
id: vrcnotifier.vrc.api.transport
parent: vrcnotifier.vrc.api
name: {zh: "请求传输与限流退避", en: "Request Transport & Throttling"}
description:
  zh: >
      所有 VRChat 调用底下的传输层。请求带上目标 URL 的 cookie 头，并按一分钟滑动窗口限流；429、网络错误与 5xx 按指数退避加抖动重试，次数有界；401 永不重试，因为那是需要调用方解决的会话问题。登录、2FA 与 authToken 主动关闭重试，让用户立即看到失败。
      
  en: >
      The transport beneath every VRChat call. Requests carry the cookie header for the target URL and are throttled by a sliding one-minute window; 429, network errors and 5xx retry with exponential backoff plus jitter up to a bounded attempt count, while 401 is never retried because it is a session problem for the caller to resolve. Login, 2FA and authToken opt out of retries so the user sees failures immediately.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:19.896Z"
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
