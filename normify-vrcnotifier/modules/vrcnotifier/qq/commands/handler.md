---
uid: 4442ef1e
id: vrcnotifier.qq.commands.handler
parent: vrcnotifier.qq.commands
name: {zh: "指令处理与世界名补全", en: "Command Handler & World Fill"}
description:
  zh: >
      收到消息就回一份在线列表；正在等验证码时例外，那时直接发数字会被当成验证码。
  en: >
      Replies with the online list, except while a login code is expected — then a bare code is treated as the code.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:57.820Z"
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
