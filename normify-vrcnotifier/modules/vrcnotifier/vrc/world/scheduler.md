---
uid: 492fb304
id: vrcnotifier.vrc.world.scheduler
parent: vrcnotifier.vrc.world
name: {zh: "请求排队", en: "Request Queue"}
description:
  zh: >
      排队控制：同时最多问几个、每分钟最多问几次。
      
  en: >
      Queues requests so only a few run at once and the rate stays within limits.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.296Z"
fingerprint: a27d6e390af2c711d653bf972b2aa6d291b709f0c609f79a7a75933b50146777
source:
  - path: "src/world.js"
    line: 82
    end_line: 121
apis:
  - protocol: rpc
    path: "schedule(task)"
    description:
      zh: >
          在并发与速率限制下排队执行任务。
          
      en: >
          Queue a task respecting the concurrency and rate limits.
          
  - protocol: rpc
    path: "pump()"
    description:
      zh: >
          有空位就排空队列，被速率挡住时睡到下一个窗口。
          
      en: >
          Drain the queue as slots free up, waking at the next rate window.
          
---
