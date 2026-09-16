---
uid: "66851233"
id: vrcnotifier.qq.bot.registry
parent: vrcnotifier.qq.bot
name: {zh: "机器人注册与生命周期", en: "Bot Registry & Lifecycle"}
description:
  zh: >
      持有机器人注册表并负责与已存设置调和。启动时为每个已存账号启动机器人；sync 对比目标配置与运行现状，相应连接、重连或停止，并返回变更计数使设置页能如实反馈。status 暴露是否已配置、已连接、令牌与绑定状态，每次状态变化都回调给调用方用于广播。
      
  en: >
      Owns the bot registry and its reconciliation with stored settings. On startup it starts a bot for every saved account; sync compares the desired configuration against what is running and connects, reconnects or stops accordingly, reporting the change counts so the settings page can say what actually happened. Status exposes configured, connected, token and binding state, and each transition is reported to the caller for broadcast.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
