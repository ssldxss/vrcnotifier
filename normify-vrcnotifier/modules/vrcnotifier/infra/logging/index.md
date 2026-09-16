---
uid: 38d78cfc
id: vrcnotifier.infra.logging
parent: vrcnotifier.infra
name: {zh: "日志栈", en: "Logging Stack"}
description:
  zh: >
      “日志”背后的三层协作：负责格式化与分发的日志器、供面板实时流使用的有界内存环，以及用稳定序号保存完整历史的分段文件。
      
  en: >
      Three cooperating layers behind 'the log': the logger that formats and fans out lines, the bounded in-memory ring used for the live panel stream, and the segmented files that hold the full history with stable sequence numbers.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
fingerprint: d72c5fec27ac01aefe5f06b32d6e20dc373c9191ce502588e97d3c991f72ddda
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
