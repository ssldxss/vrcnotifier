---
uid: 6755835b
id: vrcnotifier.server.friends
parent: vrcnotifier.server
name: {zh: "好友路由", en: "Friend Routes"}
description:
  zh: >
      好友读取与配置路由：GET /api/friends 返回全部好友的前端就绪序列化结果（世界名从缓存补，缺失则后台触发查询，不阻塞响应）；PUT /api/friends/:friendId/config 整组写入五个通知开关（未传字段默认 true）并回显落库后的配置。
      
  en: >
      Friend read and configuration routes: GET /api/friends returns every row serialized for the panel (world name filled from cache, world-name lookups kicked in the background so the response never blocks), and PUT /api/friends/:friendId/config writes the five notification flags as a whole group (unspecified flags default to true) and echoes the stored config.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:27.989Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
    line: 847
    end_line: 853
  - path: "src/server.js"
    line: 896
    end_line: 909
apis:
  - protocol: http
    method: GET
    path: "/api/friends"
    description:
      zh: >
          列出全部好友（含世界名、头像 key 与逐好友配置）。
          
      en: >
          List all friends with world name, avatar key and per-friend config.
          
  - protocol: http
    method: PUT
    path: "/api/friends/:friendId/config"
    description:
      zh: >
          写入单个好友的通知配置。
          
      en: >
          Upsert one friend's notification configuration.
          
deps:
  - kind: call
    to: vrcnotifier.data.friends
    from_api: "GET /api/friends"
    to_api: "rpc:listFriends()"
    label: {zh: "读写好友行", en: "Read and write friend rows"}
  - kind: call
    to: vrcnotifier.server.serialization
    from_api: "GET /api/friends"
    to_api: "rpc:friendRow(f)"
    label: {zh: "序列化响应", en: "Serialize responses"}
  - kind: call
    to: vrcnotifier.vrc.world.cache
    from_api: "GET /api/friends"
    to_api: "rpc:get(worldId)"
    label: {zh: "触发世界名查询", en: "Kick world name lookups"}
---
