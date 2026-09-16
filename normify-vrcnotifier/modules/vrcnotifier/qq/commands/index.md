---
uid: a887d6ee
id: vrcnotifier.qq.commands
parent: vrcnotifier.qq
name: {zh: "聊天指令", en: "Chat Commands"}
description:
  zh: >
      聊天侧行为：把好友表渲染成可读的在线列表，以及同时充当 2FA 验证码入口的指令处理。
      
  en: >
      Chat-side behaviour: turning the friend table into a readable online list, and the command entry that also doubles as the 2FA code intake.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
