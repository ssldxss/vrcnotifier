---
uid: 0eacff28
id: vrcnotifier.app.config.env
parent: vrcnotifier.app.config
name: {zh: "环境变量读取", en: "Environment Variable Reading"}
description:
  zh: >
      从环境变量里读配置，没填就用默认值。
      
  en: >
      Reads settings from environment variables, falling back to defaults when a value is unset.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.854Z"
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
