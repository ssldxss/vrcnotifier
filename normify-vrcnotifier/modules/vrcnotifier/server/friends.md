---
uid: 6755835b
id: vrcnotifier.server.friends
parent: vrcnotifier.server
name: {zh: "好友路由", en: "Friend Routes"}
description:
  zh: >
      让面板读取好友列表，并勾选每个好友要收哪些通知。
  en: >
      Lets the panel read the friend list, and tick which notifications you want for each friend.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:19.394Z"
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
    label: {zh: "读写好友行", en: "Read and write friend rows"}
  - kind: call
    to: vrcnotifier.server.serialization
    label: {zh: "序列化响应", en: "Serialize responses"}
  - kind: call
    to: vrcnotifier.vrc.world.cache
    label: {zh: "触发世界名查询", en: "Kick world name lookups"}
---
