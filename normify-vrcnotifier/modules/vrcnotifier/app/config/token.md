---
uid: 46ef4d54
id: vrcnotifier.app.config.token
parent: vrcnotifier.app.config
name: {zh: "访问令牌解析与迁移", en: "Access Token Resolution & Migration"}
description:
  zh: >
      决定网页访问令牌：优先用环境变量或已保存的，都没有就新生成一个并记住。
      
  en: >
      Decides the web access token: reuse the one from the environment or from storage, otherwise generate a new one and remember it.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.855Z"
fingerprint: f25564c89baf4114b3baf36c945152cf491a94287d92e6f2350aba5bd057df88
source:
  - path: "src/index.js"
    line: 32
    end_line: 60
apis:
  - protocol: rpc
    path: "resolveAccessToken(db, dbPath, logger)"
    description:
      zh: >
          解析或生成访问令牌，并迁移旧 token.txt。
          
      en: >
          Resolve or generate the access token and migrate legacy token.txt.
          
deps:
  - kind: call
    to: vrcnotifier.data.settings
    label: {zh: "读写令牌设置", en: "Read/write token setting"}
---
