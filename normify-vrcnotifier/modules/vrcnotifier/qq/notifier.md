---
uid: 2ce0783e
id: vrcnotifier.qq.notifier
parent: vrcnotifier.qq
name: {zh: "通知渠道分发", en: "Notification Fan-out"}
description:
  zh: >
      通知渠道层，目前只有 QQ，但按扇出结构编写，增加第二个渠道只需多一个 key 而不必重写。它从全局设置读取开关与凭据，经模板模块渲染变更，以 Markdown 发送，并把失败归一为 ok/reason 结果而不是抛异常。另有一条原始文本通道承载不应套模板的系统消息。
      
  en: >
      The notification channel layer, currently QQ only but shaped as a fan-out so a second channel would be a new key rather than a rewrite. It reads the global settings for the switch and credentials, renders the change through the template module, sends markdown, and normalizes failures into an ok/reason result instead of throwing. A separate raw-text path carries system messages that should not be templated.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:10.935Z"
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
    from_api: "rpc:sendAll(user, change)"
    to_api: "rpc:buildQq(change, opts)"
    label: {zh: "渲染消息", en: "Render the message"}
  - kind: call
    to: vrcnotifier.qq.bot.sender
    from_api: "rpc:sendAll(user, change)"
    to_api: "rpc:sendText(dbId, text, opts)"
    label: {zh: "经 QQ 投递", en: "Deliver over QQ"}
  - kind: call
    to: vrcnotifier.data.settings
    from_api: "rpc:sendAll(user, change)"
    to_api: "rpc:getGlobalSettings()"
    label: {zh: "读取渠道开关", en: "Read the channel switch"}
---
