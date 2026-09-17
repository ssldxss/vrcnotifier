---
uid: b40c455a
id: vrcnotifier.monitor.timers
parent: vrcnotifier.monitor
name: {zh: "定时安排", en: "Scheduled Work"}
description:
  zh: >
      安排什么时候自动核对、多久检查一次连接。
      
  en: >
      Schedules when to check again, and how often to look at the connection.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:23:01.489Z"
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
          把最近一段时间的自动核对往后推。
          
      en: >
          Push the recent automatic checks back.
          
  - protocol: rpc
    path: "startTimers()"
    description:
      zh: >
          启动自动核对与静默检测定时器（重复调用也安全）。
          
      en: >
          Start the automatic check and silence-detection timers (safe to call twice).
          
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
    label: {zh: "触发自动核对", en: "Fire the auto-reconcile"}
  - kind: call
    to: vrcnotifier.monitor.watchdog
    label: {zh: "触发静默检测", en: "Fire the watchdog"}
  - kind: call
    to: vrcnotifier.monitor.snapshot
    label: {zh: "按时核对", en: "Checks on schedule"}
---
