---
uid: 88f426c3
id: vrcnotifier.infra.logging.logger
parent: vrcnotifier.infra.logging
name: {zh: "日志器与行格式", en: "Logger & Line Format"}
description:
  zh: >
      统一的日志格式：时间、级别、类别、正文，同时送去终端和日志文件。
      
  en: >
      One format for every line — time, level, category, text — sent to the terminal and the log file at the same time.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.264Z"
fingerprint: dad346d151126757bfecb58b1aa65eee4ff6241bcf1640ee751c8b7a54d6d9ca
source:
  - path: "src/util.js"
    line: 11
    end_line: 91
apis:
  - protocol: rpc
    path: "createLogger(defaultCategory, out)"
    description:
      zh: >
          创建绑定默认分类的日志器。
          
      en: >
          Create a logger bound to a default category.
          
  - protocol: rpc
    path: "parseCategory(msg)"
    description:
      zh: >
          提取行首 [分类] 标签并归一旧式别名。
          
      en: >
          Extract a leading [category] tag and normalize legacy aliases.
          
deps:
  - kind: call
    to: vrcnotifier.infra.logging.time
    label: {zh: "格式化时间", en: "Format the timestamp"}
  - kind: call
    to: vrcnotifier.infra.logging.memory-stream
    label: {zh: "写入内存环", en: "Push to the ring buffer"}
  - kind: call
    to: vrcnotifier.infra.logging.file-segments.append
    label: {zh: "写入文件日志", en: "Append to the file log"}
---
