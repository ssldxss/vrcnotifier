---
uid: a012d552
id: vrcnotifier.monitor.group-name
parent: vrcnotifier.monitor
name: {zh: "群组名缓存与退避", en: "Group Name Cache & Backoff"}
description:
  zh: >
      为群组公告查群名；查不到就算了，不耽耽误发通知。
      
  en: >
      Looks up group names for announcement notifications; if that fails it carries on rather than holding up the notification.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.267Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
source:
  - path: "src/monitor.js"
    line: 249
    end_line: 301
apis:
  - protocol: rpc
    path: "groupCacheFresh(groupId)"
    description:
      zh: >
          判断缓存群名是否仍可用。
          
      en: >
          Decide whether the cached group name is still usable.
          
  - protocol: rpc
    path: "resolveGroupName(vrcapi, groupId, selfVrcId)"
    description:
      zh: >
          先批量拉用户群组再单查，失败后等得一次比一次久。
          
      en: >
          Resolve a group name via bulk user-groups then a single lookup, waiting longer after each failure.
          
deps:
  - kind: call
    to: vrcnotifier.data.cache
    label: {zh: "读写群组缓存", en: "Read/write group cache"}
  - kind: call
    to: vrcnotifier.vrc.api.social
    label: {zh: "查询群组", en: "Look up groups"}
---
