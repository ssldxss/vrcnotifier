---
uid: e7333261
id: vrcnotifier.vrc.api.social
parent: vrcnotifier.vrc.api
name: {zh: "好友/世界/群组接口", en: "Friend, World & Group Calls"}
description:
  zh: >
      社交读取接口。好友列表比较特殊：VRChat 把在线与离线好友分在两个查询里，因此该方法按需分页拉取名册，并用 onPage 回调上报累计条数，使等待页能显示如实进度。世界、群组与用户群组读取则是世界名与群组公告背后的查询。
      
  en: >
      The social read calls. The friend listing is special: VRChat splits online and offline friends across separate queries, so the method pages through whichever roster is requested and invokes an onPage callback with the running total so the boot overlay can show honest progress. World, group and user-groups reads are the lookups behind world names and group announcements.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:10.935Z"
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
    from_api: "rpc:friends({offline, pageSize, onPage})"
    to_api: "rpc:request(path, opts)"
    label: {zh: "发出请求", en: "Send the request"}
---
