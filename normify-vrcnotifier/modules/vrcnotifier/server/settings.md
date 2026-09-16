---
uid: dd7a9972
id: vrcnotifier.server.settings
parent: vrcnotifier.server
name: {zh: "设置路由", en: "Settings Routes"}
description:
  zh: >
      全局设置路由：GET 返回白名单设置，QQ AppSecret 打码；PUT 同时接受 camelCase 与 snake_case，掩码值视为保持原值、空值视为清空，经带类型的白名单落库后重新同步 QQ 机器人，并按打码后的字段记录变更日志。
      
  en: >
      Global setting routes: GET returns the whitelisted settings with the QQ app secret masked; PUT accepts either camelCase or snake_case keys, treats the mask sentinel as 'keep the stored value' and an empty value as 'clear', persists through the typed whitelist, then resyncs the QQ bot and logs the change with the secret re-masked.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:44.403Z"
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
          读取全局设置（密钥打码）。
          
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
    label: {zh: "密钥打码", en: "Mask secrets"}
---
