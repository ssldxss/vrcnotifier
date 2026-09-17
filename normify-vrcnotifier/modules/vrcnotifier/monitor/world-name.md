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
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:39.661Z"
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
    label: {zh: "查询与同步取名", en: "Query and peek world names"}
  - kind: call
    to: vrcnotifier.infra.util.deadline
    label: {zh: "限制等待时长", en: "Bound the wait"}
---
