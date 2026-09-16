---
uid: 028c28a8
id: vrcnotifier.vrc.cookiejar
parent: vrcnotifier.vrc
name: {zh: "Cookie 会话保持", en: "Cookie Session Jar"}
description:
  zh: >
      为 fetch 客户端实现的极简浏览器式 cookie jar：解析 Set-Cookie 属性，同名同域同路径的 cookie 直接替换而不堆叠，按域后缀、路径前缀、过期时间与 secure 标志匹配，并可经 JSON 往返序列化，使会话能加密持久化并在重启后恢复。
      
  en: >
      A deliberately minimal browser-like cookie jar for the fetch client: it parses Set-Cookie attributes, replaces cookies on the same name/domain/path triple instead of stacking them, matches on domain suffix, path prefix, expiry and the secure flag, and can round-trip through JSON so the session survives a restart inside the encrypted store.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:31:28.813Z"
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
