---
uid: 4ed8532b
id: vrcnotifier.vrc.pipeline.frames
parent: vrcnotifier.vrc.pipeline
name: {zh: "消息解析与排队", en: "Message Parsing & Order"}
description:
  zh: >
      解析收到的消息：同一条不重复处理，同一个人的消息按顺序处理。
      
  en: >
      Parses incoming messages, skips duplicates, and handles one person's messages in order.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.294Z"
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
