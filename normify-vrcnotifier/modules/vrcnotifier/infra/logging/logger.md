---
uid: 88f426c3
id: vrcnotifier.infra.logging.logger
parent: vrcnotifier.infra.logging
name: {zh: "日志器与行格式", en: "Logger & Line Format"}
description:
  zh: >
      把每行格式化为时间、级别、分类与正文。分类取自行首的方括号标签，使旧调用点继续可用，并用别名表把中英文标签归一到同一套词表。它先写可选的文件日志以便在那里推导序号，并返回日志流条目，使调用方随后能重写该行——这正是启动访问令牌能在原地被打码的方式。
      
  en: >
      Formats every line as time, level, category and body. The category comes from a leading bracketed tag so older call sites keep working, with aliases mapping Chinese and English tags onto one vocabulary. It writes the optional file log first so the sequence number can be derived there, and returns the stream entry so a caller can later rewrite a line — which is how the startup access token gets masked in place.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
fingerprint: d45be10322348d08689f4370017a56b85227e1051cb460ef6fd221c61535d6eb
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
    to: vrcnotifier.infra.logging.file-segments
    label: {zh: "写入文件日志", en: "Append to the file log"}
---
