---
uid: c84a2dd2
id: vrcnotifier.app.lifecycle.main
parent: vrcnotifier.app.lifecycle
name: {zh: "主流程", en: "Main Entry"}
description:
  zh: >
      真正把程序跑起来：建好所有部件、监听端口，并恢复上次的登录。
      
  en: >
      Actually runs the program: builds every part, starts listening on the port, and restores the previous login.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.857Z"
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
    label: {zh: "构建应用", en: "Build the application"}
  - kind: call
    to: vrcnotifier.app.config.token
    label: {zh: "解析访问令牌", en: "Resolve the access token"}
  - kind: call
    to: vrcnotifier.qq.bot.registry
    label: {zh: "启动已存账号的机器人", en: "Start bots for saved accounts"}
  - kind: call
    to: vrcnotifier.server.auth.auto-login
    label: {zh: "恢复会话", en: "Restore the session"}
---
