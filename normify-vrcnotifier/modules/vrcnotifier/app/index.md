---
uid: 9ad3f66b
id: vrcnotifier.app
parent: vrcnotifier
name: {zh: "应用组装与启动", en: "Application Assembly & Boot"}
description:
  zh: >
      把整个程序拼起来，并负责开机和关机：读配置、连数据库、拉起监控和 QQ 机器人、开网页服务。
      
  en: >
      Puts the whole program together and handles start-up and shut-down: reads settings, opens the database, starts monitoring, the QQ bot and the web server.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:59:42.578Z"
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
    label: {zh: "组装服务", en: "Wire services"}
  - kind: call
    to: vrcnotifier.app.lifecycle
    label: {zh: "启停生命周期", en: "Boot and shutdown"}
  - kind: call
    to: vrcnotifier.vrc
    label: {zh: "建 VRChat 客户端", en: "Builds the VRChat client"}
  - kind: call
    to: vrcnotifier.qq
    label: {zh: "建 QQ 机器人", en: "Builds the QQ bot"}
  - kind: call
    to: vrcnotifier.server
    label: {zh: "启动网页服务", en: "Starts the web server"}
---
