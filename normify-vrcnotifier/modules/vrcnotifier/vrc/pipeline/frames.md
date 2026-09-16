---
uid: 4ed8532b
id: vrcnotifier.vrc.pipeline.frames
parent: vrcnotifier.vrc.pipeline
name: {zh: "帧解析与串行队列", en: "Frame Parsing & Serial Queue"}
description:
  zh: >
      两个看似不起眼但很关键的行为。其一，帧会与同一连接上的上一帧去重（基线在 open 时清空，避免新连接的首帧被吞），且 content 为字符串时会再解析一次，因为 VRChat 的某些通知就是这样发的。其二，同一用户的所有处理按 promise 链串行，慢异步工作也不会把该用户的事件乱序。
      
  en: >
      Two deceptively important behaviours. First, frames are de-duplicated against the previous frame of the same connection (the baseline is cleared on open so the first frame of a new connection is never swallowed), and a string content field is parsed a second time because VRChat sends some notifications that way. Second, all handlers for one user run on a promise chain, so slow async work can never reorder events for that user.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:31:28.813Z"
fingerprint: fcec1a31e9954f30b8b2af8101c21e657a5bb6faf7760f9cd5cc6094782be79e
source:
  - path: "src/pipeline.js"
    line: 90
    end_line: 105
  - path: "src/pipeline.js"
    line: 186
    end_line: 213
apis:
  - protocol: rpc
    path: "parseFrame(raw, conn)"
    description:
      zh: >
          解析单帧，兼容内层 content 又是字符串的情况。
      en: >
          Parse one frame, tolerating the stringly-typed nested content.
  - protocol: rpc
    path: "summarizeFrame(parsed)"
    description:
      zh: >
          把一帧压缩成一行有界长度的日志。
      en: >
          Summarize a frame into one bounded log line.
  - protocol: rpc
    path: "enqueueMessage(userId, fn)"
    description:
      zh: >
          按到达顺序串行执行单用户的消息处理。
      en: >
          Run per-user message handlers strictly in arrival order.
---
