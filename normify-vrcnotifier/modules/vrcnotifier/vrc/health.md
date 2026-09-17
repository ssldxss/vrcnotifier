---
uid: 99884c85
id: vrcnotifier.vrc.health
parent: vrcnotifier.vrc
name: {zh: "API 健康探测", en: "API Health Probe"}
description:
  zh: >
      定时探一下 VRChat，看它响应快不快。
      
  en: >
      Pings VRChat regularly to see how responsive it is.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.910Z"
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
