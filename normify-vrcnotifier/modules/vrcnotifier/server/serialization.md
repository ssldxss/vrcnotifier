---
uid: bdf51305
id: vrcnotifier.server.serialization
parent: vrcnotifier.server
name: {zh: "响应序列化与脱敏", en: "Response Serialization & Scrubbing"}
description:
  zh: >
      把数据库行转成前端零解析的响应，并在出站时脱敏：补世界名（同步 peek 缓存）、头像缓存 key 与嵌套好友配置，从用户行剔除 cookie_data/密码，对 QQ AppSecret 打码，并在所有出站日志行中替换访问令牌。
      
  en: >
      Turns database rows into frontend-ready payloads and scrubs secrets on the way out: adds world name (sync cache peek), avatar cache key and nested friend config, strips cookie_data/password from user rows, masks the QQ app secret, and replaces the access token in every outbound log line.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:44.403Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
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
          为好友行补充 world_name/avatarKey/逐好友配置。
          
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
          对设置中的密钥字段打码。
          
      en: >
          Mask secret settings fields.
          
  - protocol: rpc
    path: "maskOut(line)"
    description:
      zh: >
          对出站文本替换访问令牌为打码形式。
          
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
