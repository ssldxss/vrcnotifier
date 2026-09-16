---
uid: 4b8f4952
id: vrcnotifier.vrc.pipeline.stats
parent: vrcnotifier.vrc.pipeline
name: {zh: "消息速率统计", en: "Message Rate Statistics"}
description:
  zh: >
      保留一分钟的每秒消息计数，供面板的 WebSocket 速率图表使用。序列通过遍历最近 60 个秒桶生成，使图表拿到定宽数组且空缺补零；读写时都会清理过期桶以保持结构有界。
      
  en: >
      Per-second message counters retained for one minute, used by the panel's WebSocket rate chart. Series are built by walking the last sixty second-buckets so the chart receives a fixed-width array with gaps filled as zero, and old buckets are pruned on every read and write to keep the structure bounded.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:31:28.813Z"
fingerprint: fcec1a31e9954f30b8b2af8101c21e657a5bb6faf7760f9cd5cc6094782be79e
source:
  - path: "src/pipeline.js"
    line: 28
    end_line: 54
apis:
  - protocol: rpc
    path: "noteMessage(atMs)"
    description:
      zh: >
          把收到的消息计入所属秒桶。
      en: >
          Count a received message into its second bucket.
  - protocol: rpc
    path: "messageSeries(nowMs)"
    description:
      zh: >
          返回最近 60 个秒桶与总数。
      en: >
          Return the last 60 one-second buckets plus the total.
---
