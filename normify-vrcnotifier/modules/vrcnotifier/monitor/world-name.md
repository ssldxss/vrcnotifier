---
uid: eda01951
id: vrcnotifier.monitor.world-name
parent: vrcnotifier.monitor
name: {zh: "世界名取用", en: "World Name Access"}
description:
  zh: >
      监控层对世界名服务的薄适配。缓存、查询与失败兜底都在 world 模块，这里只决定“等多久”与哨兵值处理：同步 peek 从不发请求；异步查询套一层时限，超时先用缓存的旧名兜底，后台查询继续跑完。
      
  en: >
      The monitor's thin adapter over the world-name service. Caching, querying and failure fallback all live in the world module; this unit only decides how long to wait and how to treat sentinels: a synchronous peek never issues a request, and the asynchronous lookup wraps the query in a deadline that falls back to the previous cached name while the background query keeps running.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:10.935Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
    line: 231
    end_line: 247
apis:
  - protocol: rpc
    path: "prevWorldName(worldId)"
    description:
      zh: >
          同步取缓存世界名；private 哨兵就地写死。
          
      en: >
          Synchronous cached world name; the private sentinel is hard-coded.
          
  - protocol: rpc
    path: "lookupWorldName(worldId)"
    description:
      zh: >
          带调用侧时限地等待世界名，超时回退缓存旧名。
          
      en: >
          Await a world name with a caller-side deadline, falling back to the cached value.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.world.cache
    from_api: "rpc:lookupWorldName(worldId)"
    to_api: "rpc:get(worldId)"
    label: {zh: "查询与同步取名", en: "Query and peek world names"}
  - kind: call
    to: vrcnotifier.infra.util.deadline
    from_api: "rpc:lookupWorldName(worldId)"
    to_api: "rpc:withDeadline(promise, timeoutMs, onTimeout)"
    label: {zh: "限制等待时长", en: "Bound the wait"}
---
