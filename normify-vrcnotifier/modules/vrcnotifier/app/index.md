---
uid: 9ad3f66b
id: vrcnotifier.app
parent: vrcnotifier
name: {zh: "应用装配与启动", en: "Application Wiring & Boot"}
description:
  zh: >
      组合根：读取环境变量与运行参数、解析访问令牌与主密钥、按依赖顺序装配数据库/日志/头像/VRChat/QQ/监控/HTTP 各组服务，并提供进程启动自检与优雅退出。
      
  en: >
      Composition root: reads environment and runtime parameters, resolves the access token and master key, wires database/logging/avatar/VRChat/QQ/monitor/HTTP services in dependency order, and provides boot self-checks plus graceful shutdown.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:19.896Z"
fingerprint: 137ccc5696e85476106021a03ff213d4fb00a4d6225ab41d4a12f6aec8ba4c1d
source:
  - path: "src/index.js"
  - path: "serve.js"
deps:
  - kind: call
    to: vrcnotifier.app.config
    label: {zh: "读取配置与令牌", en: "Read config and token"}
  - kind: call
    to: vrcnotifier.app.wiring
    label: {zh: "装配服务", en: "Wire services"}
  - kind: call
    to: vrcnotifier.app.lifecycle
    label: {zh: "启停生命周期", en: "Boot and shutdown"}
---
