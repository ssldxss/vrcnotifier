---
uid: ab684ad9
id: vrcnotifier.app.wiring.services
parent: vrcnotifier.app.wiring
name: {zh: "领域服务装配", en: "Domain Service Wiring"}
description:
  zh: >
      按调用方向装配全部领域服务并打通回调：VRChat REST 客户端工厂 → 世界名查询 → QQ 指令与机器人 → 通知器 → WS 管线（回指监控处理消息）→ 监控编排（回指管线、通知器、世界名）；另起健康探测与服务状态探针。
      
  en: >
      Wires every domain service in call order and connects their callbacks: VRChat REST client factory, world-name lookup, QQ commands and bot, notifier, WS pipeline (whose onMessage points back at the monitor), then the monitor (pointing back at pipeline, notifier and world names); health and service-status probes start alongside.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:27.989Z"
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
          装配 VRChat/QQ/通知/管线/监控服务。
          
      en: >
          Wire VRChat, QQ, notifier, pipeline and monitor services.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.api.transport
    from_api: "rpc:wireDomainServices(opts)"
    to_api: "rpc:request(path, opts)"
    label: {zh: "VRChat 客户端工厂", en: "VRChat client factory"}
  - kind: call
    to: vrcnotifier.vrc.world.cache
    from_api: "rpc:wireDomainServices(opts)"
    to_api: "rpc:get(worldId)"
    label: {zh: "世界名服务", en: "World name service"}
  - kind: call
    to: vrcnotifier.qq.commands.handler
    from_api: "rpc:wireDomainServices(opts)"
    to_api: "rpc:handleCommand(ctx)"
    label: {zh: "聊天指令处理", en: "Chat command handler"}
  - kind: call
    to: vrcnotifier.qq.bot.registry
    from_api: "rpc:wireDomainServices(opts)"
    to_api: "rpc:startAll(users)"
    label: {zh: "QQ 机器人", en: "QQ bot manager"}
  - kind: call
    to: vrcnotifier.qq.notifier
    from_api: "rpc:wireDomainServices(opts)"
    to_api: "rpc:sendAll(user, change)"
    label: {zh: "通知器", en: "Notifier"}
  - kind: call
    to: vrcnotifier.vrc.pipeline.control
    from_api: "rpc:wireDomainServices(opts)"
    to_api: "rpc:connect(userId, displayName)"
    label: {zh: "WS 管线", en: "WS pipeline"}
  - kind: call
    to: vrcnotifier.monitor.core
    from_api: "rpc:wireDomainServices(opts)"
    to_api: "rpc:createMonitor(opts)"
    label: {zh: "监控编排", en: "Monitor"}
  - kind: call
    to: vrcnotifier.vrc.health
    from_api: "rpc:wireDomainServices(opts)"
    to_api: "rpc:start()"
    label: {zh: "健康探测", en: "Health probe"}
  - kind: call
    to: vrcnotifier.vrc.status
    from_api: "rpc:wireDomainServices(opts)"
    to_api: "rpc:status()"
    label: {zh: "服务状态探针", en: "Service status probe"}
---
