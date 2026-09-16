---
uid: 68e7cd79
id: vrcnotifier.server.monitor-control
parent: vrcnotifier.server
name: {zh: "对账与测试通知路由", en: "Snapshot & Test Notification Routes"}
description:
  zh: >
      两个运维动作：POST /api/monitor/snapshot 立即跑一次对账（不重试，失败回 502，返回快照时间），让面板的刷新按钮如实反映结果；POST /api/test/:kind 让通知器向指定渠道发送一条测试消息（渠道返回失败则 502）。
      
  en: >
      Two operator actions: POST /api/monitor/snapshot runs the monitor's reconciliation once (no retry, 502 on failure, returns the snapshot timestamp) so the panel's refresh button is honest about what happened, and POST /api/test/:kind asks the notifier to send a test message through the named channel (502 when the channel reports failure).
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:27.989Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
    line: 938
    end_line: 954
  - path: "src/server.js"
    line: 988
    end_line: 1003
apis:
  - protocol: http
    method: POST
    path: "/api/monitor/snapshot"
    description:
      zh: >
          手动触发一次对账快照。
          
      en: >
          Manually trigger one reconciliation snapshot.
          
  - protocol: http
    method: POST
    path: "/api/test/{kind}"
    description:
      zh: >
          按渠道类型发送测试通知。
          
      en: >
          Send a test notification for a channel kind.
          
deps:
  - kind: call
    to: vrcnotifier.monitor.snapshot.run
    from_api: "POST /api/monitor/snapshot"
    to_api: "rpc:runSnapshot(userId, opts)"
    label: {zh: "执行一次对账", en: "Run one reconciliation"}
  - kind: call
    to: vrcnotifier.qq.notifier
    from_api: "POST /api/test/{kind}"
    to_api: "rpc:sendTest(user, kind)"
    label: {zh: "发送测试通知", en: "Send a test notification"}
---
