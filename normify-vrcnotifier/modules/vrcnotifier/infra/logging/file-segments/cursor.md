---
uid: 950ee9c0
id: vrcnotifier.infra.logging.file-segments.cursor
parent: vrcnotifier.infra.logging.file-segments
name: {zh: "日志位置定位", en: "Finding a Line"}
description:
  zh: >
      在日志里定位：某一行大概在哪个文件、哪个位置。
  en: >
      Finds where a given line lives among the log files.
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:19:17.770Z"
fingerprint: 332fa6faeab819a79e7c3ed0c5e6120783ceeee315e1eeca6fc75daf3bc1eaf8
source:
  - path: "src/filelog.js"
    line: 163
    end_line: 235
apis:
  - protocol: rpc
    path: "lastSeq()"
    description:
      zh: >
          已写入的最大序号。
          
      en: >
          The highest sequence number written so far.
          
---
