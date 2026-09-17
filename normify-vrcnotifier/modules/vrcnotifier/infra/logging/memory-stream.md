---
uid: 5cb8504d
id: vrcnotifier.infra.logging.memory-stream
parent: vrcnotifier.infra.logging
name: {zh: "内存日志流", en: "In-memory Log Stream"}
description:
  zh: >
      在内存里留着最近几百条日志，给面板实时显示。
  en: >
      Keeps the most recent lines in memory for the panel's live log view.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:19:17.770Z"
fingerprint: 320d1c9498f6ca37a95120a4a4446298eaf407d3bee5580057965efb7ef08f35
source:
  - path: "src/logstream.js"
    line: 1
    end_line: 74
apis:
  - protocol: rpc
    path: "createLogStream({capacity})"
    description:
      zh: >
          创建带订阅者的有界环形缓冲。
          
      en: >
          Create a bounded ring buffer with subscribers.
          
  - protocol: rpc
    path: "push(line, externalSeq)"
    description:
      zh: >
          追加一行，可接受外部推导的序号。
          
      en: >
          Append a line, accepting an externally derived sequence number.
          
  - protocol: rpc
    path: "update(seq, line)"
    description:
      zh: >
          重写某个序号的行并通知订阅者。
          
      en: >
          Rewrite the line at a sequence number and notify subscribers.
          
  - protocol: rpc
    path: "after(afterSeq, limit)"
    description:
      zh: >
          返回某序号之后的行，用于断线补缺口。
          
      en: >
          Return lines after a sequence number for reconnect gap filling.
          
---
