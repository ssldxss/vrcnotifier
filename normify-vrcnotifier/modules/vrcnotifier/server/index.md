---
uid: aadb16f3
id: vrcnotifier.server
parent: vrcnotifier
name: {zh: "HTTP 服务与 REST API", en: "HTTP Server & REST API"}
description:
  zh: >
      网页面板和外部程序访问后端的入口：登录、好友、设置、状态、日志、头像。
      
  en: >
      How the web panel reaches the backend: login, friends, settings, status, logs and avatars.
      
revision: 930418f49d1a47dbbb3be7908060037f3d8dfdac
updated_at: "2026-09-17T06:14:56.792Z"
fingerprint: c6db8c1bef3c17e3fc24d177824020b0d73f7c641dbcc2e7a715555db2840ffb
source:
  - path: "src/server.js"
deps:
  - kind: call
    to: vrcnotifier.server.auth
    label: {zh: "认证路由", en: "Authentication routes"}
  - kind: call
    to: vrcnotifier.server.sse
    label: {zh: "事件流", en: "Event stream"}
  - kind: call
    to: vrcnotifier.server.logs
    label: {zh: "日志接口", en: "Log API"}
  - kind: call
    to: vrcnotifier.vrc
    label: {zh: "调 VRChat 接口", en: "Calls the VRChat API"}
  - kind: call
    to: vrcnotifier.monitor
    label: {zh: "控制监控", en: "Controls monitoring"}
  - kind: call
    to: vrcnotifier.infra
    label: {zh: "写日志", en: "Writes logs"}
  - kind: call
    to: vrcnotifier.web
    label: {zh: "发前端文件", en: "Serves frontend files"}
---
