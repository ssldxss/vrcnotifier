---
uid: c56773c0
id: vrcnotifier.vrc.pipeline
parent: vrcnotifier.vrc
name: {zh: "WebSocket 管线", en: "WebSocket Pipeline"}
description:
  zh: >
      和 VRChat 的实时通道：好友动态从这条线推过来。
      
  en: >
      The live channel to VRChat: friend activity arrives through it.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.914Z"
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
