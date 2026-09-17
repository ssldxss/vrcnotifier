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
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-17T00:14:58.618Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
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
