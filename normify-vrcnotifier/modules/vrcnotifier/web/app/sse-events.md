---
uid: b6282e36
id: vrcnotifier.web.app.sse-events
parent: vrcnotifier.web.app
name: {zh: "SSE 事件订阅", en: "SSE Event Subscription"}
description:
  zh: >
      事件流的客户端一半：每个会话一个 EventSource，按命名事件逐一绑定处理函数，覆盖日志及其就地更新、状态、健康、图表数据、登录进度、通知、快照、世界名、自身状态、QQ 状态、会话失效与两种 2FA 提示。由于一切都靠推送到达，整个面板里剩下的唯一轮询就是连接心跳。
      
  en: >
      The client half of the event stream: one EventSource per session with a handler per named event covering logs and their in-place updates, status, health, chart data, login progress, notifications, snapshots, world names, self state, QQ status, session expiry and the two 2FA prompts. Because everything arrives by push, the only polling left in the whole panel is the connection heartbeat.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:27.989Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 1930
    end_line: 2005
apis:
  - protocol: rpc
    path: "connectEvents()"
    description:
      zh: >
          打开事件流并为每个命名事件绑定处理函数。
          
      en: >
          Open the event stream and wire one handler per named event.
          
deps:
  - kind: call
    to: vrcnotifier.web.sdk
    from_api: "rpc:connectEvents()"
    to_api: "rpc:Client.subscribeEvents(handlers)"
    label: {zh: "打开事件流", en: "Open the event stream"}
  - kind: call
    to: vrcnotifier.web.app.boot.state-machine
    from_api: "rpc:connectEvents()"
    to_api: "rpc:bootProgress(d)"
    label: {zh: "喂登录进度", en: "Feed login progress"}
  - kind: call
    to: vrcnotifier.web.app.roster
    from_api: "rpc:connectEvents()"
    to_api: "rpc:applyWorldName(worldId, worldName)"
    label: {zh: "应用在线变化", en: "Apply presence changes"}
  - kind: call
    to: vrcnotifier.web.app.log-viewer
    from_api: "rpc:connectEvents()"
    to_api: "rpc:replaceLogLine(seq, line)"
    label: {zh: "推送后端日志", en: "Stream backend logs"}
  - kind: call
    to: vrcnotifier.web.app.status
    from_api: "rpc:connectEvents()"
    to_api: "rpc:renderStatus(d)"
    label: {zh: "更新状态徽章", en: "Update status badges"}
  - kind: call
    to: vrcnotifier.web.app.ws-chart.canvas
    from_api: "rpc:connectEvents()"
    to_api: "rpc:wsChartPush(sec, n)"
    label: {zh: "喂速率图表", en: "Feed the rate chart"}
---
