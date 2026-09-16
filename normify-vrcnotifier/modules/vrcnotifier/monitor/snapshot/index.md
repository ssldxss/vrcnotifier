---
uid: 2d623a94
id: vrcnotifier.monitor.snapshot
parent: vrcnotifier.monitor
name: {zh: "快照对账", en: "Snapshot Reconciliation"}
description:
  zh: >
      REST 全量对账，权威画面：它也是恢复判定中“API 返回 200”这一半的唯一来源，因此定时触发与每次重连都要走它。
      
  en: >
      REST reconciliation, the authoritative picture: it is also the only source of the 'API returned 200' half of the recovery criterion, so both the scheduled interval and every reconnect go through it.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:58.166Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
deps:
  - kind: call
    to: vrcnotifier.monitor.snapshot.run
    label: {zh: "执行对账", en: "Run the reconciliation"}
  - kind: call
    to: vrcnotifier.monitor.snapshot.auth-401
    label: {zh: "401 分流", en: "Branch on 401"}
---
