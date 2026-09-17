---
uid: 2d623a94
id: vrcnotifier.monitor.snapshot
parent: vrcnotifier.monitor
name: {zh: "完整核对", en: "Full Snapshot Check"}
description:
  zh: >
      定时把所有好友的现状重新核一遍，作为最可靠的依据。
      
  en: >
      Periodically re-reads every friend's current state, which is the most reliable source of truth.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.272Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
source:
  - path: "src/monitor.js"
deps:
  - kind: call
    to: vrcnotifier.monitor.snapshot.run
    label: {zh: "执行核对", en: "Run the full check"}
  - kind: call
    to: vrcnotifier.monitor.snapshot.auth-401
    label: {zh: "401 分流", en: "Branch on 401"}
  - kind: call
    to: vrcnotifier.monitor.state
    label: {zh: "核对结果交给状态", en: "Hands results to state"}
---
