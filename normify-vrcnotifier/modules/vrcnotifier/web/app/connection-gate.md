---
uid: 9d82c2c6
id: vrcnotifier.web.app.connection-gate
parent: vrcnotifier.web.app
name: {zh: "连接门禁与心跳", en: "Connection Gate & Heartbeat"}
description:
  zh: >
      应用之前的门，以及门后的看门狗。门禁收集协议、主机、端口与令牌，向后端校验通过后才展示登录页。进入之后由 4 秒心跳持续看守：后端不应答时弹出重连弹窗，但带冷却，使短暂重启不会引发弹窗风暴；后端恢复后弹窗自动关闭。
      
  en: >
      The wall in front of the app, and the watchdog behind it. The gate collects scheme, host, port and token, verifies them against the backend and only then reveals the login view. Once inside, a four-second heartbeat keeps watching: when the backend stops answering the reconnect modal appears, but with a cooldown so a brief restart does not produce a modal storm, and it closes itself automatically when the backend comes back.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
          加载引导配置并校验输入的令牌。
          
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
