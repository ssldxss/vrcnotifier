---
uid: b40c455a
id: vrcnotifier.monitor.timers
parent: vrcnotifier.monitor
name: {zh: "定时器生命周期", en: "Timer Lifecycle"}
description:
  zh: >
      自动对账是滑动窗口：任何一次对账触发都会清掉旧定时器并把下一次推到完整间隔之后，因此频繁活动只会顺延而不会叠加。启动是幂等的，同时装上 watchdog 间隔；所有定时器都 unref，且回调全部挂 catch，调度与 promise 拒绝都不会拖垮进程。
      
  en: >
      The automatic reconciliation is a sliding window: any reconciliation trigger clears the old timer and pushes the next run a full interval into the future, so frequent activity keeps deferring it rather than piling on. Start is idempotent and also installs the watchdog interval; every timer is unref'd and every callback catches, so neither the scheduler nor a rejected promise can take the process down.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:10.935Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
    line: 1072
    end_line: 1098
apis:
  - protocol: rpc
    path: "scheduleAutoReconcile()"
    description:
      zh: >
          顺延滑动窗口的自动对账。
          
      en: >
          Reschedule the sliding-window automatic reconciliation.
          
  - protocol: rpc
    path: "startTimers()"
    description:
      zh: >
          启动自动对账与看门狗定时器（幂等）。
          
      en: >
          Start the automatic reconciliation and watchdog timers (idempotent).
          
  - protocol: rpc
    path: "stopTimers()"
    description:
      zh: >
          停止两个定时器。
          
      en: >
          Stop both timers.
          
deps:
  - kind: call
    to: vrcnotifier.monitor.snapshot.run
    from_api: "rpc:scheduleAutoReconcile()"
    to_api: "rpc:runSnapshot(userId, opts)"
    label: {zh: "触发自动对账", en: "Fire the auto-reconcile"}
  - kind: call
    to: vrcnotifier.monitor.watchdog
    from_api: "rpc:startTimers()"
    to_api: "rpc:runWatchdog()"
    label: {zh: "触发看门狗", en: "Fire the watchdog"}
---
