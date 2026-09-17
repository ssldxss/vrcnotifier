---
uid: "94664277"
id: vrcnotifier.vrc.world.transport
parent: vrcnotifier.vrc.world
name: {zh: "世界信息查询", en: "World Lookup"}
description:
  zh: >
      去问 VRChat 这个世界的名字，不需要登录也能问。
  en: >
      Asks VRChat for a world's name; no login required.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:57.819Z"
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
