---
uid: 028c28a8
id: vrcnotifier.vrc.cookiejar
parent: vrcnotifier.vrc
name: {zh: "登录凭据", en: "Login Credentials"}
description:
  zh: >
      记住 VRChat 给的登录凭据，让后续请求不用重新登录。
      
  en: >
      Remembers the credentials VRChat hands out, so later requests do not need to sign in again.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.291Z"
fingerprint: 39e1c54bde1e9cae990ba67572bb451343b4bdfc4d83e99f97083f5afa2673ad
source:
  - path: "src/cookiejar.js"
    line: 1
    end_line: 97
apis:
  - protocol: rpc
    path: "CookieJar.setCookies(headers, url)"
    description:
      zh: >
          解析一个或多个 Set-Cookie 头并入库。
          
      en: >
          Parse one or more Set-Cookie headers into the jar.
          
  - protocol: rpc
    path: "CookieJar.cookieHeader(url)"
    description:
      zh: >
          为指定 URL 构造 Cookie 请求头。
          
      en: >
          Build the Cookie request header for a URL.
          
  - protocol: rpc
    path: "CookieJar.serialize()"
    description:
      zh: >
          序列化 jar 以便加密持久化。
          
      en: >
          Serialize the jar for encrypted persistence.
          
  - protocol: rpc
    path: "CookieJar.deserialize(json)"
    description:
      zh: >
          从持久化 JSON 重建 jar，容忍数据损坏。
          
      en: >
          Rebuild a jar from persisted JSON, tolerating corruption.
          
---
