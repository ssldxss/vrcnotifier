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
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-17T00:14:58.614Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
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
