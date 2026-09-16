---
uid: 97c5e8cf
id: vrcnotifier.vrc.world.cache
parent: vrcnotifier.vrc.world
name: {zh: "缓存、冷却与请求合并", en: "Cache, Cooldown & Coalescing"}
description:
  zh: >
      缓存之上的策略：成功名有效期 1 小时；同一世界的并发调用共享同一次在途请求；刚完成的结果在合并窗口内复用。连续失败转入冷却，从 5 分钟逐次翻倍到 1 小时封顶，冷却期内调用方立刻拿到缓存的（可能过期的）名字而不再等待——因为晚报到的结果已无人消费。跟踪表有上限并会清理。
      
  en: >
      Policy around the cache: a successful name lives one hour, an in-flight request is shared by all callers asking for the same world, and a result settled within the dedupe window is reused. Repeated failures switch to a cooldown that doubles from five minutes to one hour, during which callers get the cached (possibly stale) name immediately instead of waiting — because a late answer has no consumer. Tracking maps are bounded and swept.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:10.935Z"
fingerprint: a27d6e390af2c711d653bf972b2aa6d291b709f0c609f79a7a75933b50146777
source:
  - path: "src/world.js"
    line: 123
    end_line: 175
  - path: "src/world.js"
    line: 248
    end_line: 284
apis:
  - protocol: rpc
    path: "peek(worldId)"
    description:
      zh: >
          同步读取缓存，绝不发请求。
          
      en: >
          Synchronous cache read that never issues a request.
          
  - protocol: rpc
    path: "freshName(worldId)"
    description:
      zh: >
          仅在 TTL 内才返回缓存名。
          
      en: >
          Return a cached name only while still within its TTL.
          
  - protocol: rpc
    path: "coolDown(worldId)"
    description:
      zh: >
          记录一次失败并返回本次冷却时长。
          
      en: >
          Record a failure and return the next cooldown length.
          
  - protocol: rpc
    path: "get(worldId)"
    description:
      zh: >
          查询世界名，合并在途与刚完成的请求。
          
      en: >
          Look up a world name, coalescing in-flight and recently settled requests.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.world.resolve
    from_api: "rpc:get(worldId)"
    to_api: "rpc:resolveWorld(worldId)"
    label: {zh: "执行查询", en: "Perform the lookup"}
  - kind: call
    to: vrcnotifier.data.cache
    from_api: "rpc:get(worldId)"
    to_api: "rpc:getWorldCache(worldId)"
    label: {zh: "读缓存名字", en: "Read the cached name"}
---
