---
uid: cfba0ae3
id: vrcnotifier.monitor.session
parent: vrcnotifier.monitor
name: {zh: "会话注册与用户启停", en: "Session Registry & Activation"}
description:
  zh: >
      开启或停止监控某个账号；启动时先安静地读一遗现状，免得一开机就发一堆通知。
      
  en: >
      Starts and stops watching an account; on start it reads the current state quietly, so you do not get a burst of notifications.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:23:01.487Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
    line: 196
    end_line: 229
apis:
  - protocol: rpc
    path: "activateUser(user, vrcapi)"
    description:
      zh: >
          注册用户、连接管线并安静地做一次首次核对。
          
      en: >
          Register a user, connect the pipeline and run the first quiet check.
          
  - protocol: rpc
    path: "deactivateUser(vrcId)"
    description:
      zh: >
          反注册用户并清理其管线与定时器。
          
      en: >
          Unregister a user and tear down its pipeline and timers.
          
  - protocol: rpc
    path: "activeUsers()"
    description:
      zh: >
          活跃会话的浅拷贝视图。
          
      en: >
          Snapshot view of active sessions.
          
  - protocol: rpc
    path: "sendShutdownNotice()"
    description:
      zh: >
          向全部活跃用户推送监控停止通知。
          
      en: >
          Notify every active user that monitoring is stopping.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.pipeline.control
    label: {zh: "连接与断开", en: "Connect and disconnect"}
  - kind: call
    to: vrcnotifier.monitor.snapshot.run
    label: {zh: "首次核对", en: "Run the first check"}
  - kind: call
    to: vrcnotifier.qq.notifier
    label: {zh: "推送停止通知", en: "Send the shutdown notice"}
  - kind: call
    to: vrcnotifier.monitor.state.pending-verification
    label: {zh: "取消待确认检查", en: "Cancel pending checks"}
  - kind: call
    to: vrcnotifier.monitor.snapshot
    label: {zh: "首次核对", en: "Runs the first check"}
  - kind: call
    to: vrcnotifier.monitor.state
    label: {zh: "初始化状态", en: "Initialises state"}
---
