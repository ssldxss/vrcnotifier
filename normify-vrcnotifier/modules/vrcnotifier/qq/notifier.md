---
uid: 2ce0783e
id: vrcnotifier.qq.notifier
parent: vrcnotifier.qq
name: {zh: "通知渠道分发", en: "Notification Fan-out"}
description:
  zh: >
      把一条变化渲染成消息并发出。
      
  en: >
      Renders a change into a message and sends it out.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.893Z"
fingerprint: 0ed32c13ab7327b4479d8267b8a441440778a3908f41b102927015c69bb3b051
source:
  - path: "src/notify.js"
    line: 1
    end_line: 69
apis:
  - protocol: rpc
    path: "sendAll(user, change)"
    description:
      zh: >
          渲染变更并经已启用的渠道发送。
          
      en: >
          Render a change and send it through the enabled channels.
          
  - protocol: rpc
    path: "sendQqText(dbId, text, opts)"
    description:
      zh: >
          不经模板直接发送原始文本。
          
      en: >
          Send raw text without going through a template.
          
  - protocol: rpc
    path: "sendTest(user, kind)"
    description:
      zh: >
          发送一条合成测试通知。
          
      en: >
          Send a synthetic test notification.
          
deps:
  - kind: call
    to: vrcnotifier.qq.templates.message
    label: {zh: "渲染消息", en: "Render the message"}
  - kind: call
    to: vrcnotifier.qq.bot.sender
    label: {zh: "经 QQ 投递", en: "Deliver over QQ"}
  - kind: call
    to: vrcnotifier.data.settings
    label: {zh: "读取渠道开关", en: "Read the channel switch"}
  - kind: call
    to: vrcnotifier.qq.bot
    label: {zh: "通过机器人发送", en: "Sends via the bot"}
  - kind: call
    to: vrcnotifier.qq.templates
    label: {zh: "套用文案", en: "Uses the templates"}
---
