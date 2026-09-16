---
uid: c20c54e3
id: vrcnotifier.vrc.world
parent: vrcnotifier.vrc
name: {zh: "世界名按需查询", en: "World Name Lookup"}
description:
  zh: >
      全项目唯一的“世界编号换显示名”入口，分为无状态传输层与负责缓存、合并、冷却与兜底策略层两部分。
      
  en: >
      The single project-wide entry point for turning a world id into a display name, split into a stateless transport and a policy layer that owns caching, coalescing, cooldown and fallback.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:19.896Z"
fingerprint: a27d6e390af2c711d653bf972b2aa6d291b709f0c609f79a7a75933b50146777
source:
  - path: "src/world.js"
deps:
  - kind: call
    to: vrcnotifier.vrc.world.transport
    label: {zh: "查询世界信息", en: "Fetch world info"}
  - kind: call
    to: vrcnotifier.vrc.world.cache
    label: {zh: "缓存与合并", en: "Cache and coalesce"}
  - kind: call
    to: vrcnotifier.vrc.world.resolve
    label: {zh: "查询与兜底", en: "Resolve with fallback"}
---
