---
uid: 97c5e8cf
id: vrcnotifier.vrc.world.cache
parent: vrcnotifier.vrc.world
name: {zh: "缓存、冷却与请求合并", en: "Cache, Cooldown & Coalescing"}
description:
  zh: >
      记住查过的名字，短时间内重复问直接用记着的；同一个世界同时被问只发一次请求。
      
  en: >
      Remembers names already looked up, reuses them for a while, and sends only one request when several callers ask at once.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.915Z"
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
    label: {zh: "执行查询", en: "Perform the lookup"}
  - kind: call
    to: vrcnotifier.data.cache
    label: {zh: "读缓存名字", en: "Read the cached name"}
---
