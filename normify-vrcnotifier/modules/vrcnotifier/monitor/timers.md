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
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.887Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
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
