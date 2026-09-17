---
uid: 88fa9a65
id: vrcnotifier.infra.logging.file-segments.append
parent: vrcnotifier.infra.logging.file-segments
name: {zh: "写入日志行", en: "Writing Lines"}
description:
  zh: >
      把一行日志写进去；当前文件满了就换一个新的。
      
  en: >
      Writes one line, starting a new file when the current one is full.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.262Z"
fingerprint: 332fa6faeab819a79e7c3ed0c5e6120783ceeee315e1eeca6fc75daf3bc1eaf8
source:
  - path: "src/filelog.js"
    line: 140
    end_line: 161
apis:
  - protocol: rpc
    path: "append(text)"
    description:
      zh: >
          追加一行并返回推导出的序号。
          
      en: >
          Append a line and return its derived sequence number.
          
---
