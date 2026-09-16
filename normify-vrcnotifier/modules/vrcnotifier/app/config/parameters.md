---
uid: 0603a48f
id: vrcnotifier.app.config.parameters
parent: vrcnotifier.app.config
name: {zh: "运行参数装配", en: "Runtime Parameter Assembly"}
description:
  zh: >
      把环境变量与调用方覆盖项合并成运行时参数对象：VRChat API/WS 地址、User-Agent、CORS 来源、2FA 会话 TTL、加密模式，以及监控（确认延迟/去重窗口/快照间隔/watchdog）与 WS（ping/pong/重连退避/jitter）两组阈值。
      
  en: >
      Merges environment variables and caller overrides into the runtime parameter object: VRChat API/WS URLs, user agent, CORS origin, pending-2FA TTL, encryption mode, plus monitor thresholds (confirm delay, dedupe window, snapshot interval, watchdog) and WS thresholds (ping/pong, reconnect backoff, jitter).
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:31:28.813Z"
fingerprint: f25564c89baf4114b3baf36c945152cf491a94287d92e6f2350aba5bd057df88
source:
  - path: "src/index.js"
    line: 104
    end_line: 132
apis:
  - protocol: rpc
    path: "runtimeConfig(opts)"
    description:
      zh: >
          合并默认值与环境变量，产出运行时参数。
      en: >
          Merge defaults and environment into runtime parameters.
---
