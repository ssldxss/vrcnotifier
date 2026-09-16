---
uid: a012d552
id: vrcnotifier.monitor.group-name
parent: vrcnotifier.monitor
name: {zh: "群组名缓存与退避", en: "Group Name Cache & Backoff"}
description:
  zh: >
      为公告通知解析群名。先查缓存（成功名有效期 1 小时；缓存为未知群组时按 retry_at 决定是否复用），未命中优先批量拉取用户群组灌缓存（区分成员关系 id 与群组 id），仍不行再单查群组；失败时写回按 5 秒起、逐次翻倍、封顶 1 小时的退避窗口，使通知永不被名称解析阻塞。
      
  en: >
      Resolves group names for announcement notifications. It checks the cache first (successful names live one hour; a cached unknown-name entry is reused until its retry time), then prefers one bulk user-groups call to warm the cache (distinguishing membership ids from group ids), falls back to a single group lookup, and on failure stores a backoff window that grows 5s doubling up to one hour so notifications are never blocked by name resolution.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:58.166Z"
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
          先批量拉用户群组再单查，失败按指数退避。
          
      en: >
          Resolve a group name via bulk user-groups then a single lookup, with exponential backoff on failure.
          
deps:
  - kind: call
    to: vrcnotifier.data.cache
    label: {zh: "读写群组缓存", en: "Read/write group cache"}
  - kind: call
    to: vrcnotifier.vrc.api.social
    label: {zh: "查询群组", en: "Look up groups"}
---
