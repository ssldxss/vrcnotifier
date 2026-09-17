---
uid: c20c54e3
id: vrcnotifier.vrc.world
parent: vrcnotifier.vrc
name: {zh: "世界名按需查询", en: "World Name Lookup"}
description:
  zh: >
      把世界编号换成世界名字。
      
  en: >
      Turns a world id into a world name.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.674Z"
fingerprint: a27d6e390af2c711d653bf972b2aa6d291b709f0c609f79a7a75933b50146777
source:
  - path: "src/world.js"
deps:
  - kind: call
    to: vrcnotifier.vrc.world.transport
    label: {zh: "查询世界信息", en: "Fetch world info"}
  - kind: call
    to: vrcnotifier.vrc.world.cache
    label: {zh: "缓存与合并", en: "Cache and merge"}
  - kind: call
    to: vrcnotifier.vrc.world.resolve
    label: {zh: "查询与兜底", en: "Resolve with fallback"}
---
