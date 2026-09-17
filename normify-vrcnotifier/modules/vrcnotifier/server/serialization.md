---
uid: bdf51305
id: vrcnotifier.server.serialization
parent: vrcnotifier.server
name: {zh: "响应序列化与脱敏", en: "Response Serialization & Scrubbing"}
description:
  zh: >
      把数据库行转成前端零解析的响应，并在出站时脱敏：补世界名（同步 peek 缓存）、按唯一头像地址（avatar_url）推出头像缓存 key（与写库用的 util.avatarFields 同源）、补嵌套好友配置，从用户行剔除 cookie_data/密码，对 QQ AppSecret 打码，并在所有出站日志行中替换访问令牌。
      
  en: >
      Turns database rows into frontend-ready payloads and scrubs secrets on the way out: adds world name (sync cache peek), the avatar cache key derived from the single stored avatar_url (same rule the writers use via util.avatarFields) and nested friend config, strips cookie_data/password from user rows, masks the QQ app secret, and replaces the access token in every outbound log line.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:59:42.577Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
source:
  - path: "src/server.js"
    line: 49
    end_line: 52
  - path: "src/server.js"
    line: 75
    end_line: 148
apis:
  - protocol: rpc
    path: "friendRow(f)"
    description:
      zh: >
          为好友行补充 world_name/avatarKey/逐好友配置；avatarKey 由 avatar_url 换算。
          
      en: >
          Attach world_name, avatarKey and per-friend config to a friend row.
          
  - protocol: rpc
    path: "selfUserForClient(row)"
    description:
      zh: >
          序列化当前用户（含头像 key 与世界名）。
          
      en: >
          Serialize the current user with avatar key and world name.
          
  - protocol: rpc
    path: "maskUser(row)"
    description:
      zh: >
          从用户行中移除 cookie 与密码。
          
      en: >
          Drop cookie data and password from a user row.
          
  - protocol: rpc
    path: "maskSettings(row)"
    description:
      zh: >
          把设置里的密钥字段加星号。
          
      en: >
          Mask secret settings fields.
          
  - protocol: rpc
    path: "maskOut(line)"
    description:
      zh: >
          把要发出去的文本里的访问令牌换成星号。
          
      en: >
          Replace the configured access token on outbound text.
          
  - protocol: rpc
    path: "worldNameOf(row)"
    description:
      zh: >
          用缓存同步补世界名，不发请求。
          
      en: >
          Read a cached world name without issuing a request.
          
  - protocol: rpc
    path: "kickWorldNames(rows)"
    description:
      zh: >
          为一批行触发后台世界名查询。
          
      en: >
          Kick background world-name lookups for a batch of rows.
          
  - protocol: rpc
    path: "configOf(f)"
    description:
      zh: >
          把逐好友通知开关还原成嵌套 config 形状。
          
      en: >
          Project per-friend notification flags into the nested config shape.
          
deps:
  - kind: call
    to: vrcnotifier.infra.avatar.naming
    label: {zh: "推导头像缓存 key", en: "Derive avatar cache keys"}
  - kind: call
    to: vrcnotifier.vrc.world.cache
    label: {zh: "同步取世界名", en: "Peek cached world names"}
---
