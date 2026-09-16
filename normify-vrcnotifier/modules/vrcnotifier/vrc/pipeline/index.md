---
uid: c56773c0
id: vrcnotifier.vrc.pipeline
parent: vrcnotifier.vrc
name: {zh: "WebSocket 管线", en: "WebSocket Pipeline"}
description:
  zh: >
      VRChat 实时管线客户端：连接生命周期与重连、帧解析与去重、协议层 ping/pong 保活、故障升级，以及每秒消息统计。
      
  en: >
      The VRChat realtime pipeline client: connection lifecycle with reconnection, frame parsing and de-duplication, protocol ping/pong keepalive, failure escalation and the per-second message statistics.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:19.896Z"
fingerprint: fcec1a31e9954f30b8b2af8101c21e657a5bb6faf7760f9cd5cc6094782be79e
source:
  - path: "src/pipeline.js"
deps:
  - kind: call
    to: vrcnotifier.vrc.pipeline.connection
    label: {zh: "连接生命周期", en: "Connection lifecycle"}
  - kind: call
    to: vrcnotifier.vrc.pipeline.control
    label: {zh: "控制接口", en: "Control API"}
---
