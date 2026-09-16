---
uid: 436a6ee5
id: vrcnotifier.monitor.snapshot.run
parent: vrcnotifier.monitor.snapshot
name: {zh: "全量对账主流程", en: "Snapshot Reconciliation Run"}
description:
  zh: >
      一次 me() 同时获得三个在线状态数组、好友名册与自身在线状态。随后在线与活动好友用一次分页请求取详情，离线好友零请求（首次对账额外拉一次离线名册以补全资料），逐个喂给状态机；已入库但不在名册中的行视为已删除好友并删除。状态数组缺失时本轮跳过好友判定而不是猜测；任何未预期异常都被捕获，不会穿透调用方。
      
  en: >
      One me() call yields the three presence arrays, the friend roster and the user's own presence. Online and active friends are fetched in one paged request while offline friends cost nothing; each friend is fed through the state machine, and rows absent from the roster are treated as removed friends and deleted. A missing status array skips friend judgement for that round rather than guessing, and unexpected exceptions are caught so the caller never sees them.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:10.935Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
    line: 854
    end_line: 1056
apis:
  - protocol: rpc
    path: "runSnapshot(userId, opts)"
    description:
      zh: >
          为单个用户执行一次全量对账。
          
      en: >
          Run one full reconciliation for a user.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.api.auth
    from_api: "rpc:runSnapshot(userId, opts)"
    to_api: "rpc:me(opts)"
    label: {zh: "读取 me()", en: "Read me()"}
  - kind: call
    to: vrcnotifier.vrc.api.social
    from_api: "rpc:runSnapshot(userId, opts)"
    to_api: "rpc:friends({offline, pageSize, onPage})"
    label: {zh: "拉取好友名册", en: "Fetch friend rosters"}
  - kind: call
    to: vrcnotifier.monitor.state.friend-apply
    from_api: "rpc:runSnapshot(userId, opts)"
    to_api: "rpc:applyFriendInput(user, friendVrcId, input, opts)"
    label: {zh: "逐个落地好友", en: "Persist each friend"}
  - kind: call
    to: vrcnotifier.monitor.state.self-presence
    from_api: "rpc:runSnapshot(userId, opts)"
    to_api: "rpc:applySelfInput(user, input)"
    label: {zh: "落地自身状态", en: "Persist self presence"}
  - kind: call
    to: vrcnotifier.monitor.snapshot.auth-401
    from_api: "rpc:runSnapshot(userId, opts)"
    to_api: "rpc:handleAuth401(e, userId)"
    label: {zh: "401 分流", en: "Branch on 401"}
  - kind: call
    to: vrcnotifier.monitor.snapshot.progress
    from_api: "rpc:runSnapshot(userId, opts)"
    to_api: "rpc:emitProgress(userId, payload)"
    label: {zh: "上报进度", en: "Report progress"}
---
