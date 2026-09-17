---
uid: bd96a7ca
id: vrcnotifier.app.wiring.http
parent: vrcnotifier.app.wiring
name: {zh: "HTTP 组装与令牌加星号", en: "HTTP Setup & Hiding Tokens"}
description:
  zh: >
      创建网页服务，并让访问令牌在日志里显示为星号。
      
  en: >
      Creates the web server, and makes sure the access token is masked in logs.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.252Z"
fingerprint: f25564c89baf4114b3baf36c945152cf491a94287d92e6f2350aba5bd057df88
source:
  - path: "src/index.js"
    line: 238
    end_line: 272
apis:
  - protocol: rpc
    path: "buildApplication(opts)"
    description:
      zh: >
          组装完整应用（可注入依赖，便于测试）。
          
      en: >
          Build the complete application with injectable dependencies for tests.
          
deps:
  - kind: call
    to: vrcnotifier.server.runtime
    label: {zh: "构建 HTTP 应用", en: "Build the HTTP app"}
---
