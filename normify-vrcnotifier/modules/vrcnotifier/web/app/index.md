---
uid: 7f5c4186
id: vrcnotifier.web.app
parent: vrcnotifier.web
name: {zh: "面板应用", en: "Panel Application"}
description:
  zh: >
      面板应用本体：后端连接与心跳、登录与 2FA、启动等待页、实时日志、带动效的好友列表、设置、状态图表、SSE 事件总线与外壳交互。
      
  en: >
      The panel application itself: backend connection and heartbeat, login and 2FA, the boot overlay, live logs, the friend roster with its motion effects, settings, status charts, the SSE event bus and the shell interactions.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
deps:
  - kind: call
    to: vrcnotifier.web.app.bootstrap
    label: {zh: "启动引导", en: "Bootstrap"}
  - kind: call
    to: vrcnotifier.web.app.connection-gate
    label: {zh: "连接门禁", en: "Connection gate"}
  - kind: call
    to: vrcnotifier.web.app.login
    label: {zh: "登录流程", en: "Login flow"}
  - kind: call
    to: vrcnotifier.web.app.sse-events
    label: {zh: "事件流", en: "Event stream"}
  - kind: call
    to: vrcnotifier.web.app.roster
    label: {zh: "好友列表", en: "Friend roster"}
---
