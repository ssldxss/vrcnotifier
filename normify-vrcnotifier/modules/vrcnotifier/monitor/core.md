---
uid: 3bb7a8d5
id: vrcnotifier.monitor.core
parent: vrcnotifier.monitor
name: {zh: "监控装配与共享状态", en: "Monitor Assembly & Runtime State"}
description:
  zh: >
      工厂装配与共享运行态：依赖注入、日志器与事件总线选择、会话表及 running/awaitingSnapshot/pendingStatus/pendingBuckets/connState 等集合、全部阈值默认值（确认延迟、去重窗口、快照间隔、watchdog、状态合并、故障通知、世界名等待、群组重试），以及惰性连接态与对外暴露的方法面。
      
  en: >
      Factory assembly and shared runtime state: dependency injection, logger and event-bus selection, the session table plus the running/awaitingSnapshot/pendingStatus/pendingBuckets/connState collections, all threshold defaults (confirm delay, dedupe window, snapshot interval, watchdog, status coalesce, fault notify, world wait, group retry), the lazily built connection state and the exposed public surface.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:58.166Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
    line: 11
    end_line: 58
  - path: "src/monitor.js"
    line: 1100
    end_line: 1106
apis:
  - protocol: rpc
    path: "createMonitor(opts)"
    description:
      zh: >
          注入依赖与阈值，创建监控编排实例。
          
      en: >
          Create the monitor with all collaborators and thresholds.
          
  - protocol: rpc
    path: "stateOf(userId)"
    description:
      zh: >
          惰性构造单个用户的连接态记录。
          
      en: >
          Lazily materialise the per-user connection state record.
          
deps:
  - kind: dataflow
    to: vrcnotifier.data.friends
    label: {zh: "好友状态存储", en: "Friend state store"}
  - kind: dataflow
    to: vrcnotifier.qq.notifier
    label: {zh: "通知渠道", en: "Notification channel"}
  - kind: dataflow
    to: vrcnotifier.vrc.pipeline.control
    label: {zh: "实时数据源", en: "Realtime source"}
---
