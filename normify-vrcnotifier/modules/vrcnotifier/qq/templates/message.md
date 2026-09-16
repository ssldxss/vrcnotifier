---
uid: 05c84c9c
id: vrcnotifier.qq.templates.message
parent: vrcnotifier.qq.templates
name: {zh: "消息组装", en: "Message Assembly"}
description:
  zh: >
      以两种形态组装最终消息：站内通知走自己的模板并只保留非空行；好友状态变更则先输出加粗的社交状态行，再输出加粗的变化字段，然后是不加粗的未变化字段与时间。模板模式下刻意不再转义整体输出，因为模板作者可信，而被插值的值在先前已转义。
      
  en: >
      Assembles the final message in two shapes: in-app notifications use their own template and only include non-empty lines, while friend state changes produce a bolded social line, then bolded changed fields, then plain unchanged fields and a timestamp. Template mode deliberately does not escape its output, since the template author is trusted while only the interpolated values were escaped.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:10.935Z"
fingerprint: 883db5c48ad541745ac77c62cb229bdaa5bab2bb5cdba1945ffc08164b19eb6e
source:
  - path: "src/templates.js"
    line: 90
    end_line: 107
apis:
  - protocol: rpc
    path: "buildQq(change, opts)"
    description:
      zh: >
          由变更构造 QQ 消息的标题与正文。
          
      en: >
          Build the title and body of a QQ message from a change.
          
  - protocol: rpc
    path: "renderNotificationMessage(vars, template)"
    description:
      zh: >
          渲染站内通知正文，剔除空行。
          
      en: >
          Render an in-app notification body, dropping blank lines.
          
  - protocol: rpc
    path: "isVrcNotification(change)"
    description:
      zh: >
          判断是否为站内通知类系统事件。
          
      en: >
          True for in-app notification system events.
          
deps:
  - kind: call
    to: vrcnotifier.qq.templates.vars
    from_api: "rpc:buildQq(change, opts)"
    to_api: "rpc:buildChangeVars(change)"
    label: {zh: "构造变量", en: "Build variables"}
  - kind: call
    to: vrcnotifier.qq.commands.online-list
    from_api: "rpc:buildQq(change, opts)"
    to_api: "rpc:statusEmoji(status)"
    label: {zh: "共用状态表情", en: "Share the status emoji"}
---
