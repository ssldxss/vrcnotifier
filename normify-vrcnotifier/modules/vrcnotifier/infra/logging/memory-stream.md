---
uid: 5cb8504d
id: vrcnotifier.infra.logging.memory-stream
parent: vrcnotifier.infra.logging
name: {zh: "内存日志流", en: "In-memory Log Stream"}
description:
  zh: >
      保存最近若干行的环形缓冲与订阅者集合，是面板实时日志视图的数据来源。序号可由外部提供（文件层用文件名与行偏移推导），使内存与磁盘在重启后对同一行达成一致；流内记录历史最大值而非自增计数，因为外部序号是稀疏的。订阅者抛异常不会影响日志，重写某行会带 update 标记通知订阅者。
      
  en: >
      A ring buffer of the most recent lines with a subscriber set, feeding the panel's live log view. Sequence numbers may come from outside (the file layer derives them from filename and offset) so memory and disk agree on line identity across restarts; the stream tracks the highest value seen rather than counting, because those numbers are sparse. A throwing subscriber never breaks logging, and rewriting a line notifies subscribers with an update marker.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:30.745Z"
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
