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
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.685Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
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
