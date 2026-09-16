---
uid: 006fa7b4
id: vrcnotifier.web.app.settings
parent: vrcnotifier.web.app
name: {zh: "设置面板", en: "Settings Panel"}
description:
  zh: >
      设置页。由于服务端从不返回 QQ AppSecret，密码框填充的是掩码哨兵；原样提交会被服务端解释为保持原值，因此保存无关设置永远不会删掉凭据。机器人总开关关闭时会隐藏自己的字段，且切换立即保存而不等保存按钮。
      
  en: >
      The settings page. Because the server never returns the QQ app secret, the password field is populated with a mask sentinel; submitting it unchanged is interpreted server-side as keep the stored value, so saving unrelated settings never wipes credentials. The bot switch hides its own fields when off, and toggling it saves immediately rather than waiting for the save button.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
