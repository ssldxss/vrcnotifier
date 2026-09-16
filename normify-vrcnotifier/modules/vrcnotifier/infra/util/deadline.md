---
uid: c3d25117
id: vrcnotifier.infra.util.deadline
parent: vrcnotifier.infra.util
name: {zh: "Promise 超时兜底", en: "Promise Deadline"}
description:
  zh: >
      把项目的立场编码成工具：等待是调用方自己的事——原始 promise 不被取消，定时器 unref，超时以兜底结果兑现而不是拒绝。这正是慢速世界名查询能先交还缓存名并在后台继续工作的原因，而不是把需要它的通知一起拖住。
      
  en: >
      Encodes the project's stance that waiting is the caller's problem: the original promise is not cancelled, the timer is unref'd, and the deadline resolves with a fallback result instead of rejecting. That is what lets a slow world-name lookup hand back a cached name and keep working in the background, rather than holding up the notification that needed it.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:30.745Z"
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
