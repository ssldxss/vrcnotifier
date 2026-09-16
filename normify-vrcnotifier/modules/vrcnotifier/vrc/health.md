---
uid: 99884c85
id: vrcnotifier.vrc.health
parent: vrcnotifier.vrc
name: {zh: "API 健康探测", en: "API Health Probe"}
description:
  zh: >
      通过无凭据探测公开 config 端点持续测量 VRChat API 延迟（health 端点会 401 因此不可用）。每轮取若干计时样本，舍去超时者并对其余取平均；整轮失败时沿用上次成功值并标记 stale，而不是来回跳成错误。每轮完成后推送给订阅者，面板无需轮询。
      
  en: >
      Continuously measures VRChat API latency by probing the public config endpoint without credentials (the health endpoint would 401). Each round takes several timed samples, discards timeouts and averages the rest; when a whole round fails it keeps showing the last successful value marked stale rather than flapping to an error. Every completed round is pushed to subscribers so the panel never polls.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:45.134Z"
fingerprint: 09ea61db0463d2223bf23136d2210cdfd0f60a744385c3d523d27d211000db21
source:
  - path: "src/health.js"
    line: 1
    end_line: 105
apis:
  - protocol: rpc
    path: "tick()"
    description:
      zh: >
          探测公开 config 端点并取计时样本平均。
      en: >
          Probe the public config endpoint and average the timing samples.
  - protocol: rpc
    path: "start()"
    description:
      zh: >
          启动周期性探测。
      en: >
          Start periodic probing.
  - protocol: rpc
    path: "stop()"
    description:
      zh: >
          停止探测。
      en: >
          Stop probing.
  - protocol: rpc
    path: "sample()"
    description:
      zh: >
          返回最近一次平均采样。
      en: >
          Return the latest averaged sample.
---
