---
uid: 492fb304
id: vrcnotifier.vrc.world.scheduler
parent: vrcnotifier.vrc.world
name: {zh: "并发与速率调度", en: "Concurrency & Rate Scheduler"}
description:
  zh: >
      挡在每次世界请求前的小调度器：同时在途不超过 N 个，每分钟不超过 M 次。仅因速率被挡住时，它会睡到最旧的时间戳滑出窗口再继续，而不是忙等，因此一批好友同时换世界也不会冲垮公开 API。
      
  en: >
      A small scheduler in front of every world request: at most N requests in flight and at most M per minute. When only the rate limit blocks progress it sleeps until the oldest timestamp leaves the window rather than busy-waiting, so a burst of friends changing worlds cannot flood the public API.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:31:28.813Z"
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
