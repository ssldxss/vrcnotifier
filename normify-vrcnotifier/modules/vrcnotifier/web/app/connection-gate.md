---
uid: 9d82c2c6
id: vrcnotifier.web.app.connection-gate
parent: vrcnotifier.web.app
name: {zh: "连接门禁与心跳", en: "Connection Gate & Heartbeat"}
description:
  zh: >
      进面板前先让你填后端地址和令牌；进去后持续确认后端还在不在。
      
  en: >
      Asks for the backend address and token before entering, and then keeps checking the backend is still there.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.920Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 343
    end_line: 437
apis:
  - protocol: rpc
    path: "loadConfig()"
    description:
      zh: >
          加载引导配置并验证输入的令牌。
          
      en: >
          Load bootstrap config and validate the entered token.
          
  - protocol: rpc
    path: "startConnWatch()"
    description:
      zh: >
          心跳探测后端，冷却后在断开时弹出重连弹窗。
          
      en: >
          Ping the backend and pop the reconnect modal after a cooldown.
          
  - protocol: rpc
    path: "fillConnModal()"
    description:
      zh: >
          保存修正后的后端地址与令牌。
          
      en: >
          Save a corrected backend address and token.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.api-client
    label: {zh: "调用后端", en: "Call the backend"}
---
