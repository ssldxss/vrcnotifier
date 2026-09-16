---
uid: 46ef4d54
id: vrcnotifier.app.config.token
parent: vrcnotifier.app.config
name: {zh: "访问令牌解析与迁移", en: "Access Token Resolution & Migration"}
description:
  zh: >
      按优先级解析 Web 面板访问令牌：环境变量 ACCESS_TOKEN → 数据库 settings.access_token → 旧版 data/token.txt（读入后写库并删除旧文件）→ 随机生成并持久化。令牌是面板与后端之间的唯一凭据。
      
  en: >
      Resolves the web access token by priority: ACCESS_TOKEN env var, database settings.access_token, legacy data/token.txt (imported then deleted), finally a freshly generated value persisted to the database. This token is the only credential between panel and backend.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:19.896Z"
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
    label: {zh: "读写令牌设置", en: "Read/write the token setting"}
---
