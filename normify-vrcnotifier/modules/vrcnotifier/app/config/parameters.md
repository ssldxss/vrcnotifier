---
uid: 0603a48f
id: vrcnotifier.app.config.parameters
parent: vrcnotifier.app.config
name: {zh: "运行参数组装", en: "Runtime Parameter Assembly"}
description:
  zh: >
      把默认值和环境变量合并成一份实际生效的配置。
      
  en: >
      Merges defaults with environment variables into the settings actually in effect.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.248Z"
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
