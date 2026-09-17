---
uid: c05f86b5
id: vrcnotifier.vrc.status
parent: vrcnotifier.vrc
name: {zh: "VRChat 服务状态", en: "VRChat Service Status"}
description:
  zh: >
      查 VRChat 官方公告的服务状态，看它是不是挂了。
  en: >
      Checks VRChat's official status page to see whether the service is up.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:57.819Z"
fingerprint: a019a350767dacc7c04b88e0ea35383ccdc4fbd187398d599cc14b2762a69c01
source:
  - path: "src/vrcstatus.js"
    line: 1
    end_line: 104
apis:
  - protocol: rpc
    path: "status()"
    description:
      zh: >
          惰性获取官方服务状态并缓存。
          
      en: >
          Fetch the official status, lazily and cached.
          
---
