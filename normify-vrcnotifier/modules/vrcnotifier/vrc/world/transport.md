---
uid: "94664277"
id: vrcnotifier.vrc.world.transport
parent: vrcnotifier.vrc.world
name: {zh: "无 Cookie 世界查询", en: "Cookie-free World Fetch"}
description:
  zh: >
      通过公开 API 按编号查询世界，不带 cookie 也不带 Authorization，因此与登录会话彻底解耦，不会因 cookie 挂起而失效。失败统一归一为带状态码的错误供策略层分类，超时则主动中止请求而不是一直挂着。
      
  en: >
      Queries a world by id over the public API with no cookie and no Authorization header, so it is completely decoupled from the login session and cannot be broken by a suspended cookie. Failures are normalized into an error carrying a status code for the policy layer to classify, and a timeout aborts the request rather than hanging.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:31:28.813Z"
fingerprint: a27d6e390af2c711d653bf972b2aa6d291b709f0c609f79a7a75933b50146777
source:
  - path: "src/world.js"
    line: 34
    end_line: 65
apis:
  - protocol: rpc
    path: "fetchWorldInfo(worldId, opts)"
    description:
      zh: >
          不带 cookie 与授权地查询公开世界信息。
      en: >
          Fetch public world info without cookies or authorization.
---
