---
uid: 4442ef1e
id: vrcnotifier.qq.commands.handler
parent: vrcnotifier.qq.commands
name: {zh: "指令处理与世界名补全", en: "Command Handler & World Fill"}
description:
  zh: >
      指令处理把 2FA 验证码入口放在最前：等待验证期间先消费验证码回复并直接返回，根本不会去构造在线列表——这正是重登过程中直接发六位数字就能生效的原因。在线好友的世界名在同一个共享时限内统一解析，而不是每人等一次；超时则回退缓存名，后台查询继续。连接不健康时会在开头加一行数据截止时间，避免把过期列表当成实时。
      
  en: >
      The command handler gives the 2FA intake first refusal: while a verification is pending, a code reply is consumed and returned before the online list is built, which is why a bare six-digit message works during re-login. World names are resolved under one shared deadline, falling back to cached names while background lookups continue, and an unhealthy connection prepends a data-cutoff header so a stale list is not mistaken for live.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
fingerprint: 652d724595a7f9952f451e353502dd7ab8b39d064c1b32db4ce6ed02cec64d20
source:
  - path: "src/qq-commands.js"
    line: 60
    end_line: 89
  - path: "src/qq-commands.js"
    line: 91
    end_line: 118
apis:
  - protocol: rpc
    path: "handleCommand(ctx)"
    description:
      zh: >
          处理一条入站聊天消息并产出回复。
          
      en: >
          Handle one inbound chat message and produce a reply.
          
  - protocol: rpc
    path: "fillWorldNames(friends)"
    description:
      zh: >
          在一个共享时限内为在线好友解析世界名。
          
      en: >
          Resolve world names for online friends under one shared deadline.
          
deps:
  - kind: call
    to: vrcnotifier.data.friends
    label: {zh: "读取好友列表", en: "Read the friend list"}
  - kind: call
    to: vrcnotifier.vrc.world.cache
    label: {zh: "补世界名", en: "Fill world names"}
  - kind: call
    to: vrcnotifier.qq.commands.online-list
    label: {zh: "构造回复", en: "Build the reply"}
  - kind: call
    to: vrcnotifier.infra.logging.time
    label: {zh: "格式化截止时间", en: "Format the cutoff time"}
---
