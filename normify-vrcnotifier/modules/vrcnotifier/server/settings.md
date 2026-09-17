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
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.680Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
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
