---
uid: 3bb7a8d5
id: vrcnotifier.monitor.core
parent: vrcnotifier.monitor
name: {zh: "监控的组装与状态", en: "Assembly & State"}
description:
  zh: >
      把监控需要的部件装到一起，并记住当前在监控哪个账号。
      
  en: >
      Assembles the parts monitoring needs and remembers which accounts are currently being watched.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.266Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
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
          注入依赖与上限值，创建监控总控实例。
          
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
