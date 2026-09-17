---
uid: ea059d86
id: vrcnotifier.vrc.world.resolve
parent: vrcnotifier.vrc.world
name: {zh: "查询与失败兜底", en: "Lookup & Failure Fallback"}
description:
  zh: >
      真正去查，并根据失败的原因决定要不要再试。
  en: >
      Performs the lookup, and decides from the failure whether it is worth trying again.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:57.819Z"
fingerprint: a27d6e390af2c711d653bf972b2aa6d291b709f0c609f79a7a75933b50146777
source:
  - path: "src/world.js"
    line: 177
    end_line: 246
apis:
  - protocol: rpc
    path: "resolveWorld(worldId)"
    description:
      zh: >
          解析单个世界名，施加重试、冷却与兜底规则。
          
      en: >
          Resolve one world to a name, applying retry, cooldown and fallback rules.
          
  - protocol: rpc
    path: "reasonOf(err)"
    description:
      zh: >
          把错误状态码转成可读的日志原因。
          
      en: >
          Turn an error status into a human-readable reason for logs.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.world.transport
    label: {zh: "发起请求", en: "Issue the request"}
  - kind: call
    to: vrcnotifier.vrc.world.scheduler
    label: {zh: "遵守速率限制", en: "Respect rate limits"}
  - kind: call
    to: vrcnotifier.data.cache
    label: {zh: "写入已解析名字", en: "Persist the resolved name"}
---
