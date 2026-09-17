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
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.876Z"
fingerprint: dad346d151126757bfecb58b1aa65eee4ff6241bcf1640ee751c8b7a54d6d9ca
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
