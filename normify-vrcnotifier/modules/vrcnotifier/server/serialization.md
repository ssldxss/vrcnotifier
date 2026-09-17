---
uid: bdf51305
id: vrcnotifier.server.serialization
parent: vrcnotifier.server
name: {zh: "响应序列化与脱敏", en: "Response Serialization & Scrubbing"}
description:
  zh: >
      把数据库行转成前端零解析的响应，并在出站时脱敏：补世界名（同步 peek 缓存）、头像缓存 key（未存缩略图时用原图 URL 兜底转换，与自己同口径）与嵌套好友配置，从用户行剔除 cookie_data/密码，对 QQ AppSecret 打码，并在所有出站日志行中替换访问令牌。
  en: >
      Turns database rows into frontend-ready payloads and scrubs secrets on the way out: adds world name (sync cache peek), the avatar cache key (falling back to the full-size URL when no thumbnail is stored, matching the self-user path) and nested friend config, strips cookie_data/password from user rows, masks the QQ app secret, and replaces the access token in every outbound log line.
revision: 930418f49d1a47dbbb3be7908060037f3d8dfdac
updated_at: "2026-09-17T06:15:05.309Z"
fingerprint: c6db8c1bef3c17e3fc24d177824020b0d73f7c641dbcc2e7a715555db2840ffb
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
