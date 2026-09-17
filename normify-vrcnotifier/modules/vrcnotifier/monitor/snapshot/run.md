---
uid: 436a6ee5
id: vrcnotifier.monitor.snapshot.run
parent: vrcnotifier.monitor.snapshot
name: {zh: "完整核对主流程", en: "Full Snapshot Check Run"}
description:
  zh: >
      一次完整核对：读出全部好友、逐个更新，发现已经不在好友列表里的就清理掉。
      
  en: >
      One full check: read every friend, update each one, and clean up anyone who is no longer a friend.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.885Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
source:
  - path: "src/monitor.js"
    line: 854
    end_line: 1056
apis:
  - protocol: rpc
    path: "runSnapshot(userId, opts)"
    description:
      zh: >
          为单个用户执行一次完整核对。
          
      en: >
          Run one full check for a user.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.api.auth
    label: {zh: "读取 me()", en: "Read me()"}
  - kind: call
    to: vrcnotifier.vrc.api.social
    label: {zh: "拉取好友名册", en: "Fetch friend rosters"}
  - kind: call
    to: vrcnotifier.monitor.state.friend-apply
    label: {zh: "逐个保存好友", en: "Persist each friend"}
  - kind: call
    to: vrcnotifier.monitor.state.self-presence
    label: {zh: "保存自身状态", en: "Persist self presence"}
  - kind: call
    to: vrcnotifier.monitor.snapshot.auth-401
    label: {zh: "401 分流", en: "Branch on 401"}
  - kind: call
    to: vrcnotifier.monitor.snapshot.progress
    label: {zh: "上报进度", en: "Report progress"}
---
