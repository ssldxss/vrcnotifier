---
uid: 27a3ce55
id: vrcnotifier.web
parent: vrcnotifier
name: {zh: "Web 前端面板", en: "Web Panel"}
description:
  zh: >
      浏览器面板：零依赖单页应用，负责发现并鉴权后端、驱动登录与 2FA、带动画地渲染好友列表、展示实时日志与 WebSocket 速率，并通过四行等待页完成启动。
      
  en: >
      The browser panel: a dependency-free single-page app that discovers and authenticates against the backend, drives login and 2FA, renders the friend roster with motion, shows live logs and WebSocket rate, and boots through the four-line waiting overlay.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
fingerprint: fd6f9f2531be0c603222c79d09d75f7265058dcf28ef4a0a941e11422c82ce94
source:
  - path: "public/app.js"
  - path: "public/index.html"
  - path: "public/app.css"
  - path: "public/sdk.js"
  - path: "public/logview.js"
  - path: "public/vrclinks.js"
deps:
  - kind: call
    to: vrcnotifier.web.shell
    label: {zh: "页面骨架", en: "Page shell"}
  - kind: call
    to: vrcnotifier.web.app
    label: {zh: "面板应用", en: "Panel application"}
---
