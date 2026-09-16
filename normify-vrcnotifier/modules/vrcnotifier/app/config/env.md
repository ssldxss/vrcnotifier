---
uid: 0eacff28
id: vrcnotifier.app.config.env
parent: vrcnotifier.app.config
name: {zh: "环境变量读取", en: "Environment Variable Reading"}
description:
  zh: >
      统一的环境变量读取小工具：空串视为未设置（回落到默认值），并提供整数解析（解析失败同样回落）。所有可配置项（端口、阈值、外部地址）都从这里取值。
      
  en: >
      Small helpers for reading environment variables: an empty string counts as unset (falling back to the default), plus an integer parse that also falls back on failure. Every tunable (port, thresholds, external URLs) is read through these.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:31:28.812Z"
fingerprint: f25564c89baf4114b3baf36c945152cf491a94287d92e6f2350aba5bd057df88
source:
  - path: "src/index.js"
    line: 27
    end_line: 30
  - path: "src/index.js"
    line: 62
    end_line: 65
apis:
  - protocol: rpc
    path: "env(name, fallback)"
    description:
      zh: >
          读取环境变量，空串回落默认值。
      en: >
          Read an environment variable, falling back when empty.
  - protocol: rpc
    path: "envInt(name, fallback)"
    description:
      zh: >
          读取整数环境变量。
      en: >
          Read an integer environment variable.
---
