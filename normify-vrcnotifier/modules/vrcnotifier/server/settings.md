---
uid: dd7a9972
id: vrcnotifier.server.settings
parent: vrcnotifier.server
name: {zh: "设置路由", en: "Settings Routes"}
description:
  zh: >
      读取和修改设置，比如 QQ 机器人的开关和密钥。密钥读出来是加星号的。
      
  en: >
      Reads and changes settings such as the QQ bot switch and its secret; the secret is never returned in full.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.904Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
source:
  - path: "src/server.js"
    line: 911
    end_line: 936
apis:
  - protocol: http
    method: GET
    path: "/api/settings"
    description:
      zh: >
          读取全局设置（密钥加星号）。
          
      en: >
          Read global settings with secrets masked.
          
  - protocol: http
    method: PUT
    path: "/api/settings"
    description:
      zh: >
          更新全局设置并重新同步 QQ 机器人。
          
      en: >
          Update global settings and resync the QQ bot.
          
deps:
  - kind: call
    to: vrcnotifier.data.settings
    label: {zh: "读写设置", en: "Read and write settings"}
  - kind: call
    to: vrcnotifier.qq.bot.registry
    label: {zh: "重新同步机器人", en: "Resync the QQ bot"}
  - kind: call
    to: vrcnotifier.server.serialization
    label: {zh: "密钥加星号", en: "Mask secrets"}
---
