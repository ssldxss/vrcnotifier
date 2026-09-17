---
uid: bdf51305
id: vrcnotifier.server.serialization
parent: vrcnotifier.server
name: {zh: "响应序列化与脱敏", en: "Response Serialization & Scrubbing"}
description:
  zh: >
      把数据库里的原始数据整理成面板直接能用的样子，顺手去掉密码和令牌。
      
  en: >
      Turns raw database rows into shapes the panel can use directly, and strips out passwords and tokens.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.679Z"
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
