---
uid: ea059d86
id: vrcnotifier.vrc.world.resolve
parent: vrcnotifier.vrc.world
name: {zh: "查询与失败兜底", en: "Lookup & Failure Fallback"}
description:
  zh: >
      真正的查询与失败分类。404/403 是永久性的，立刻进入冷却；429 是在说“别打了”，同样直接冷却而不重试；网络、超时与 5xx 才就地重试一次，仍失败再冷却。响应缺少 name 字段视为异常，而空名字是合法的，回退用世界编号。
      
  en: >
      The actual lookup with its failure taxonomy. A 404 or 403 is permanent so it cools down immediately; a 429 is a request to stop so it also cools down rather than retrying; network, timeout and 5xx errors retry once in place and only then cool down. A response missing the name field counts as abnormal, while an empty name is legal and falls back to the world id.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:10.935Z"
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
    from_api: "rpc:resolveWorld(worldId)"
    to_api: "rpc:fetchWorldInfo(worldId, opts)"
    label: {zh: "发起请求", en: "Issue the request"}
  - kind: call
    to: vrcnotifier.vrc.world.scheduler
    from_api: "rpc:resolveWorld(worldId)"
    to_api: "rpc:schedule(task)"
    label: {zh: "遵守速率限制", en: "Respect rate limits"}
  - kind: call
    to: vrcnotifier.data.cache
    from_api: "rpc:resolveWorld(worldId)"
    to_api: "rpc:upsertWorldCache(worldId, name, atMs)"
    label: {zh: "写入已解析名字", en: "Persist the resolved name"}
---
