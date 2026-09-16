---
uid: cfba0ae3
id: vrcnotifier.monitor.session
parent: vrcnotifier.monitor
name: {zh: "会话注册与用户启停", en: "Session Registry & Activation"}
description:
  zh: >
      持有 vrchat_user_id 到会话的映射。激活时注册会话、按显示名连接 WS 管线，并立即执行一次只建基线、不发通知的首次对账；停用时断开连接并清理该用户的定时器，但不动已入库的好友行。退出时并发向全部活跃用户推送停止通知。
      
  en: >
      Owns the vrchat_user_id to session map. Activation registers the session, connects the WS pipeline with the display name and immediately runs a silent initial reconciliation that only establishes a baseline; deactivation disconnects and clears per-user timers without touching stored friend rows. Shutdown pushes a stop notice to every active user in parallel.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:10.935Z"
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
          注册用户、连接管线并做一次静默首次对账。
          
      en: >
          Register a user, connect the pipeline and run the first silent reconciliation.
          
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
    from_api: "rpc:activateUser(user, vrcapi)"
    to_api: "rpc:connect(userId, displayName)"
    label: {zh: "连接与断开", en: "Connect and disconnect"}
  - kind: call
    to: vrcnotifier.monitor.snapshot.run
    from_api: "rpc:activateUser(user, vrcapi)"
    to_api: "rpc:runSnapshot(userId, opts)"
    label: {zh: "首次对账", en: "Run the first reconciliation"}
  - kind: call
    to: vrcnotifier.qq.notifier
    from_api: "rpc:sendShutdownNotice()"
    to_api: "rpc:sendQqText(dbId, text, opts)"
    label: {zh: "推送停止通知", en: "Send the shutdown notice"}
  - kind: call
    to: vrcnotifier.monitor.state.pending-verification
    from_api: "rpc:deactivateUser(vrcId)"
    to_api: "rpc:clearPendingCheck(user, friendVrcId)"
    label: {zh: "取消 pending 校验", en: "Cancel pending checks"}
---
