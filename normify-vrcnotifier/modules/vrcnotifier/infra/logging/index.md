---
uid: 38d78cfc
id: vrcnotifier.infra.logging
parent: vrcnotifier.infra
name: {zh: "日志栈", en: "Logging Stack"}
description:
  zh: >
      日志的三层：写日志的那只手、内存里最近的一段、硬盘上的完整历史。
      
  en: >
      Logging in three layers: the writer, the recent lines kept in memory, and the full history on disk.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.264Z"
fingerprint: 1a1d0fd4801585a2fb0ab735b32aea03de0e2b93bb76047fe65d6bc0adb6f4ac
source:
  - path: "src/util.js"
  - path: "src/logstream.js"
  - path: "src/filelog.js"
deps:
  - kind: call
    to: vrcnotifier.infra.logging.logger
    label: {zh: "日志器", en: "Logger"}
  - kind: call
    to: vrcnotifier.infra.logging.memory-stream
    label: {zh: "内存流", en: "Memory stream"}
  - kind: call
    to: vrcnotifier.infra.logging.file-segments
    label: {zh: "分段文件", en: "Segmented files"}
---
