---
uid: ab684ad9
id: vrcnotifier.app.wiring.services
parent: vrcnotifier.app.wiring
name: {zh: "领域服务组装", en: "Domain Service Assembly"}
description:
  zh: >
      创建干活的各个部件并接在一起：VRChat 客户端、世界名查询、QQ 机器人、通知、实时连接和监控。
      
  en: >
      Creates the working parts and connects them: the VRChat client, world-name lookup, the QQ bot, notifications, the live connection and monitoring.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.860Z"
fingerprint: f25564c89baf4114b3baf36c945152cf491a94287d92e6f2350aba5bd057df88
source:
  - path: "src/index.js"
    line: 134
    end_line: 236
apis:
  - protocol: rpc
    path: "wireDomainServices(opts)"
    description:
      zh: >
          组装 VRChat/QQ/通知/管线/监控服务。
          
      en: >
          Wire VRChat, QQ, notifier, pipeline and monitor services.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.api.transport
    label: {zh: "VRChat 客户端工厂", en: "VRChat client factory"}
  - kind: call
    to: vrcnotifier.vrc.world.cache
    label: {zh: "世界名服务", en: "World name service"}
  - kind: call
    to: vrcnotifier.qq.commands.handler
    label: {zh: "聊天指令处理", en: "Chat command handler"}
  - kind: call
    to: vrcnotifier.qq.bot.registry
    label: {zh: "QQ 机器人", en: "QQ bot manager"}
  - kind: call
    to: vrcnotifier.qq.notifier
    label: {zh: "通知器", en: "Notifier"}
  - kind: call
    to: vrcnotifier.vrc.pipeline.control
    label: {zh: "WS 管线", en: "WS pipeline"}
  - kind: call
    to: vrcnotifier.monitor.core
    label: {zh: "监控总控", en: "Monitor"}
  - kind: call
    to: vrcnotifier.vrc.health
    label: {zh: "健康探测", en: "Health probe"}
  - kind: call
    to: vrcnotifier.vrc.status
    label: {zh: "服务状态探针", en: "Service status probe"}
---
