---
uid: 578d42f2
id: vrcnotifier.infra.logging.time
parent: vrcnotifier.infra.logging
name: {zh: "本地时间格式化", en: "Local Time Formatting"}
description:
  zh: >
      一个极小但影响面很广的函数：从日志行到停止通知，产品中所有面向人的时间戳都按服务器本地时间渲染而非 UTC，因为阅读它们的人处在一个时区，并习惯与自己的表对照。
      
  en: >
      One tiny function with a wide blast radius: every human-facing timestamp in the product, from log lines to shutdown notices, is rendered in the server's local time rather than UTC, because the people reading them are in one timezone and mentally comparing against their own clock.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:30.745Z"
fingerprint: d45be10322348d08689f4370017a56b85227e1051cb460ef6fd221c61535d6eb
source:
  - path: "src/util.js"
    line: 5
    end_line: 9
apis:
  - protocol: rpc
    path: "formatLocalTime(ts)"
    description:
      zh: >
          把时间戳格式化为本地 YYYY-MM-DD HH:mm:ss。
      en: >
          Format a timestamp as local YYYY-MM-DD HH:mm:ss.
---
