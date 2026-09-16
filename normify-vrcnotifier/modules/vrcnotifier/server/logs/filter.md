---
uid: a5621cae
id: vrcnotifier.server.logs.filter
parent: vrcnotifier.server.logs
name: {zh: "日志筛选谓词", en: "Log Filter Predicates"}
description:
  zh: >
      解析结构化日志行 [时间] [级别] [分类] 正文并施加多选筛选语义：省略某维度即不过滤，空值不匹配任何行（显式清空选择会全部隐藏），无法解析的行恒匹配以便前端强制展示。
      
  en: >
      Parses the structured log line [time] [level] [category] body and applies the multi-select filter semantics: omitting a dimension means no filtering, an empty value matches nothing (so an explicit empty selection hides everything), and unparsable lines always match so the panel can force-display them.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:31:48.745Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
    line: 21
    end_line: 32
apis:
  - protocol: rpc
    path: "logLineMatches(line, levelSel, catSel)"
    description:
      zh: >
          按选中的等级与分类集合匹配日志行。
      en: >
          Match a log line against the selected levels and categories.
  - protocol: rpc
    path: "parseLogSel(q)"
    description:
      zh: >
          解析筛选参数：省略即不过滤，空串即不匹配任何行。
      en: >
          Parse a filter query: omitted means no filter, empty means match nothing.
---
