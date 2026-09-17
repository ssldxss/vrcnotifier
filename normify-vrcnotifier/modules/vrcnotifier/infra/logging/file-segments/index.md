---
uid: 4ef4505e
id: vrcnotifier.infra.logging.file-segments
parent: vrcnotifier.infra.logging
name: {zh: "分段文件日志", en: "Segmented File Log"}
description:
  zh: >
      日志写进多个文件，写满就换一个，太老的自动删掉。
      
  en: >
      Writes logs into several files, starting a new one when the current is full and deleting the oldest when there are too many.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.874Z"
fingerprint: 332fa6faeab819a79e7c3ed0c5e6120783ceeee315e1eeca6fc75daf3bc1eaf8
source:
  - path: "src/filelog.js"
    line: 1
    end_line: 280
---
