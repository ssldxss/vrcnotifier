---
uid: 7f5c4186
id: vrcnotifier.web.app
parent: vrcnotifier.web
name: {zh: "面板应用", en: "Panel Application"}
description:
  zh: >
      面板本体：连后端、登录、看好友、看日志、改设置。
      
  en: >
      The panel itself: connect to the backend, sign in, watch friends, read logs, change settings.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.302Z"
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
  - kind: call
    to: vrcnotifier.web.sdk
    label: {zh: "建实时连接", en: "Opens the live link"}
  - kind: call
    to: vrcnotifier.web.vrclinks
    label: {zh: "把链接变成可点", en: "Turns links into clicks"}
  - kind: call
    to: vrcnotifier.web.logview
    label: {zh: "显示日志", en: "Shows the logs"}
  - kind: call
    to: vrcnotifier.web.shell
    label: {zh: "摆放页面", en: "Lays out the page"}
---
