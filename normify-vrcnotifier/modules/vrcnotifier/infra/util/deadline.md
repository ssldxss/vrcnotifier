---
uid: c3d25117
id: vrcnotifier.infra.util.deadline
parent: vrcnotifier.infra.util
name: {zh: "等待超时兜底", en: "Giving Up Gracefully"}
description:
  zh: >
      给一个操作设个时限；超时就用备用的旧值先返回，不再干等。
  en: >
      Puts a time limit on an operation; on timeout it returns the fallback value instead of waiting.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:19:17.770Z"
fingerprint: d45be10322348d08689f4370017a56b85227e1051cb460ef6fd221c61535d6eb
source:
  - path: "src/util.js"
    line: 97
    end_line: 104
apis:
  - protocol: rpc
    path: "withDeadline(promise, timeoutMs, onTimeout)"
    description:
      zh: >
          让 promise 与超时竞争，超时用兜底值兑现。
          
      en: >
          Race a promise against a timeout, resolving with a fallback value.
          
---
