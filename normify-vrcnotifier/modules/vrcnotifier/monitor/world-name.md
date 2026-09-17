---
uid: eda01951
id: vrcnotifier.monitor.world-name
parent: vrcnotifier.monitor
name: {zh: "世界名取用", en: "World Name Access"}
description:
  zh: >
      要世界名字的时候去查，但不会把等它的人拖住。
      
  en: >
      Looks up world names when asked, without making the caller wait longer than it should.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.275Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
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
    label: {zh: "查询与同步取名", en: "Query and peek world names"}
  - kind: call
    to: vrcnotifier.infra.util.deadline
    label: {zh: "限制等待时长", en: "Bound the wait"}
---
