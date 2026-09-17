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
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.899Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
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
