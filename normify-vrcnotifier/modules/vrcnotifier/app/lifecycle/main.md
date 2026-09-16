---
uid: c84a2dd2
id: vrcnotifier.app.lifecycle.main
parent: vrcnotifier.app.lifecycle
name: {zh: "主流程编排", en: "Main Entry Orchestration"}
description:
  zh: >
      组装并启动服务：生成日志与令牌、建立运行标识行、按参数构建应用、监听端口、启动 QQ 机器人（按已保存账号）、触发自动登录恢复，并把首次 WS 连接成功后的令牌行打码动作挂到事件总线上。
      
  en: >
      Assembles and starts the service: creates the logger and access token, writes the run banner, builds the application from parameters, listens on the port, starts QQ bots for saved accounts, triggers auto-login recovery, and hooks the post-first-WS-connection token masking onto the event bus.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:27.989Z"
fingerprint: f25564c89baf4114b3baf36c945152cf491a94287d92e6f2350aba5bd057df88
source:
  - path: "src/index.js"
    line: 320
    end_line: 362
apis:
  - protocol: rpc
    path: "main()"
    description:
      zh: >
          进程主入口：构建、监听并启动周边服务。
          
      en: >
          Process entry: build, listen and start surrounding services.
          
deps:
  - kind: call
    to: vrcnotifier.app.wiring.http
    from_api: "rpc:main()"
    to_api: "rpc:buildApplication(opts)"
    label: {zh: "构建应用", en: "Build the application"}
  - kind: call
    to: vrcnotifier.app.config.token
    from_api: "rpc:main()"
    to_api: "rpc:resolveAccessToken(db, dbPath, logger)"
    label: {zh: "解析访问令牌", en: "Resolve the access token"}
  - kind: call
    to: vrcnotifier.qq.bot.registry
    from_api: "rpc:main()"
    to_api: "rpc:startAll(users)"
    label: {zh: "启动已存账号的机器人", en: "Start bots for saved accounts"}
  - kind: call
    to: vrcnotifier.server.auth.auto-login
    from_api: "rpc:main()"
    to_api: "rpc:tryAutoLogin()"
    label: {zh: "恢复会话", en: "Restore the session"}
---
