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
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.877Z"
fingerprint: dad346d151126757bfecb58b1aa65eee4ff6241bcf1640ee751c8b7a54d6d9ca
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
