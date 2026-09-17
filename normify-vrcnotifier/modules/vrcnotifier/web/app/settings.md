---
uid: 006fa7b4
id: vrcnotifier.web.app.settings
parent: vrcnotifier.web.app
name: {zh: "设置面板", en: "Settings Panel"}
description:
  zh: >
      设置页：QQ 机器人、通知开关、测试推送。
  en: >
      The settings page: the QQ bot, notification switches and a test push.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:19:37.674Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 1433
    end_line: 1515
apis:
  - protocol: rpc
    path: "loadSettings()"
    description:
      zh: >
          加载设置并渲染 QQ 表单。
          
      en: >
          Load settings and render the QQ form.
          
  - protocol: rpc
    path: "saveSettings()"
    description:
      zh: >
          保存 QQ 字段，包含掩码密钥的往返。
          
      en: >
          Save the QQ fields including the masked secret round trip.
          
  - protocol: rpc
    path: "bindNotifyToggle(id, key)"
    description:
      zh: >
          切换通知开关并持久化。
          
      en: >
          Flip a notification toggle and persist it.
          
  - protocol: rpc
    path: "bindTest(kind, btnId)"
    description:
      zh: >
          经指定渠道发送测试通知。
          
      en: >
          Send a test notification through a channel.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.api-client
    label: {zh: "读写设置", en: "Read and write settings"}
  - kind: call
    to: vrcnotifier.web.app.dropdown
    label: {zh: "自定义下拉", en: "Custom dropdowns"}
---
