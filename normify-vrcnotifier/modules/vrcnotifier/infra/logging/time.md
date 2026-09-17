---
uid: 578d42f2
id: vrcnotifier.infra.logging.time
parent: vrcnotifier.infra.logging
name: {zh: "本地时间格式化", en: "Local Time Formatting"}
description:
  zh: >
      把时间显示成本地时间，方便跟自己的钟对照。
  en: >
      Shows times in your local timezone so they are easy to compare with your own clock.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:19:17.770Z"
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
