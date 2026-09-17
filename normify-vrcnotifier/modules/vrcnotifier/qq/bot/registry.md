---
uid: "66851233"
id: vrcnotifier.qq.bot.registry
parent: vrcnotifier.qq.bot
name: {zh: "机器人注册与生命周期", en: "Bot Registry & Lifecycle"}
description:
  zh: >
      按你的设置启动和停止机器人，并告诉你它当前是什么状态。
      
  en: >
      Starts and stops the bot according to your settings, and reports what state it is in.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.275Z"
fingerprint: 7094142f722e044697a2766956a9f4f48c08f4bd9cb1e41a940418989de21016
source:
  - path: "src/qq.js"
    line: 16
    end_line: 55
  - path: "src/qq.js"
    line: 437
    end_line: 509
apis:
  - protocol: rpc
    path: "sync(dbId, user)"
    description:
      zh: >
          按已存设置调和运行中的机器人，返回变更计数。
          
      en: >
          Reconcile the running bots with the stored settings; returns change counts.
          
  - protocol: rpc
    path: "startAll(users)"
    description:
      zh: >
          启动时按已存账号启动全部机器人。
          
      en: >
          Start bots for every saved account at startup.
          
  - protocol: rpc
    path: "stop(dbId)"
    description:
      zh: >
          停止单个机器人并解除绑定。
          
      en: >
          Stop one bot and forget its binding.
          
  - protocol: rpc
    path: "stopAll()"
    description:
      zh: >
          停止全部机器人。
          
      en: >
          Stop every bot.
          
  - protocol: rpc
    path: "status(dbId)"
    description:
      zh: >
          报告配置/连接/令牌/绑定状态供面板展示。
          
      en: >
          Report configured/connected/token/bound state for the panel.
          
deps:
  - kind: call
    to: vrcnotifier.qq.bot.socket
    label: {zh: "启停连接", en: "Start and stop sockets"}
  - kind: call
    to: vrcnotifier.data.settings
    label: {zh: "读取机器人设置", en: "Read the bot settings"}
  - kind: call
    to: vrcnotifier.data.qq-binding
    label: {zh: "读取绑定", en: "Read the binding"}
---
