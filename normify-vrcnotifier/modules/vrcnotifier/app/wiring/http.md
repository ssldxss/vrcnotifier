---
uid: bd96a7ca
id: vrcnotifier.app.wiring.http
parent: vrcnotifier.app.wiring
name: {zh: "HTTP 装配与令牌打码", en: "HTTP Wiring & Token Masking"}
description:
  zh: >
      把全部协作者与配置交给 createApp 得到 Express 应用、自动登录入口与连接状态查询，并把它们回填到 QQ 指令所需的只读钩子上；同时建立日志流令牌打码状态（明文留在终端与本地日志）。
      
  en: >
      Hands all collaborators and configuration to createApp, obtaining the Express app, the auto-login entry and the connection-status query, then back-fills the read-only hooks the QQ commands need; it also sets up the log-stream token-masking state (terminals and local log files keep plaintext).
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:27.989Z"
fingerprint: f25564c89baf4114b3baf36c945152cf491a94287d92e6f2350aba5bd057df88
source:
  - path: "src/index.js"
    line: 238
    end_line: 272
apis:
  - protocol: rpc
    path: "buildApplication(opts)"
    description:
      zh: >
          装配完整应用（可注入依赖，便于测试）。
          
      en: >
          Build the complete application with injectable dependencies for tests.
          
deps:
  - kind: call
    to: vrcnotifier.server.runtime
    from_api: "rpc:buildApplication(opts)"
    to_api: "rpc:createApp(opts)"
    label: {zh: "构建 HTTP 应用", en: "Build the HTTP app"}
---
