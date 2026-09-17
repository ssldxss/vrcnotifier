---
uid: e7333261
id: vrcnotifier.vrc.api.social
parent: vrcnotifier.vrc.api
name: {zh: "好友/世界/群组接口", en: "Friend, World & Group Calls"}
description:
  zh: >
      拉好友列表、查世界和群组。
  en: >
      Reads the friend list and looks up worlds and groups.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:57.819Z"
fingerprint: 41550317630bd0c2e6ca7b19edbe553bad6fd8b8e48ed4f731379e1a8333b2ec
source:
  - path: "src/vrcapi.js"
    line: 148
    end_line: 182
apis:
  - protocol: rpc
    path: "friends({offline, pageSize, onPage})"
    description:
      zh: >
          分页好友列表；offline 选离线名册，onPage 上报进度。
          
      en: >
          Paged friend list; offline selects the offline roster and onPage reports progress.
          
  - protocol: rpc
    path: "world(worldId, opts)"
    description:
      zh: >
          读取世界信息（GET /worlds/{id}）。
          
      en: >
          GET /worlds/{id}.
          
  - protocol: rpc
    path: "group(groupId, opts)"
    description:
      zh: >
          读取群组信息（需登录态）。
          
      en: >
          GET /groups/{id} (requires login).
          
  - protocol: rpc
    path: "userGroups(userId, opts)"
    description:
      zh: >
          读取用户加入的全部群组。
          
      en: >
          GET /users/{id}/groups, returning every membership at once.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.api.transport
    label: {zh: "发出请求", en: "Send the request"}
---
