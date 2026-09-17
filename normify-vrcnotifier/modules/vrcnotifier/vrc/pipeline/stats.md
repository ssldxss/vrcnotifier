---
uid: 4b8f4952
id: vrcnotifier.vrc.pipeline.stats
parent: vrcnotifier.vrc.pipeline
name: {zh: "消息速率统计", en: "Message Rate Statistics"}
description:
  zh: >
      数一数每秒收到多少条消息，给面板画折线图用。
      
  en: >
      Counts how many messages arrive per second, for the chart in the panel.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.914Z"
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
