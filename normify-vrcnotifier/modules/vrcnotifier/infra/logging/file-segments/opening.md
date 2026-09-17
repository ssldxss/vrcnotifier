---
uid: "65681333"
id: vrcnotifier.infra.logging.file-segments.opening
parent: vrcnotifier.infra.logging.file-segments
name: {zh: "段命名与启停", en: "Segment Naming & Lifecycle"}
description:
  zh: >
      决定日志文件叫什么名字，并负责打开和关闭。
      
  en: >
      Names the log files, and opens and closes them.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.874Z"
fingerprint: 332fa6faeab819a79e7c3ed0c5e6120783ceeee315e1eeca6fc75daf3bc1eaf8
source:
  - path: "src/filelog.js"
    line: 23
    end_line: 51
  - path: "src/filelog.js"
    line: 52
    end_line: 138
  - path: "src/filelog.js"
    line: 266
    end_line: 277
apis:
  - protocol: rpc
    path: "createFileLog(opts)"
    description:
      zh: >
          打开日志目录并开启新段。
          
      en: >
          Open the log directory and start a fresh segment.
          
  - protocol: rpc
    path: "closeLog()"
    description:
      zh: >
          释放全部已打开的段句柄。
          
      en: >
          Release every open segment handle.
          
  - protocol: file
    path: "data/logs/vrcnotifier-<utc>.log"
    description:
      zh: >
          以 UTC 创建时间命名的单个日志段文件。
          
      en: >
          One segment file named by its UTC creation time.
          
---
