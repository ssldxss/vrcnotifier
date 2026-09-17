---
uid: a887d6ee
id: vrcnotifier.qq.commands
parent: vrcnotifier.qq
name: {zh: "聊天指令", en: "Chat Commands"}
description:
  zh: >
      你在 QQ 里发给机器人的消息，由这里回应。
      
  en: >
      Replies to the messages you send the bot.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.890Z"
fingerprint: 652d724595a7f9952f451e353502dd7ab8b39d064c1b32db4ce6ed02cec64d20
source:
  - path: "src/qq-commands.js"
deps:
  - kind: call
    to: vrcnotifier.qq.commands.online-list
    label: {zh: "渲染在线列表", en: "Render the online list"}
  - kind: call
    to: vrcnotifier.qq.commands.handler
    label: {zh: "指令入口", en: "Command entry"}
---
