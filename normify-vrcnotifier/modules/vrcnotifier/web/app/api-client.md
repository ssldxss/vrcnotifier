---
uid: 16ba80e4
id: vrcnotifier.web.app.api-client
parent: vrcnotifier.web.app
name: {zh: "请求封装与视图切换", en: "Request Helper & View Switching"}
description:
  zh: >
      所有请求都从这里出去，并区分「没登录」和「后端连不上」两种情况。
      
  en: >
      Every request goes out through here, and it tells apart 'not signed in' from 'backend unreachable'.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.917Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 85
    end_line: 136
  - path: "public/app.js"
    line: 328
    end_line: 341
apis:
  - protocol: rpc
    path: "api(method, path, body, opts)"
    description:
      zh: >
          发起接口调用，并区分会话过期与后端不可达。
          
      en: >
          Issue an API call, distinguishing an expired session from a dead backend.
          
  - protocol: rpc
    path: "showView(name)"
    description:
      zh: >
          在连接门禁/登录/主界面三个视图间切换。
          
      en: >
          Switch between the gate, login and main views.
          
  - protocol: rpc
    path: "escapeHtml(v)"
    description:
      zh: >
          转义文本以便安全插入 HTML。
          
      en: >
          Escape text for safe HTML interpolation.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.boot.state-machine
    label: {zh: "出错时收起等待页", en: "Dismiss the overlay on error"}
  - kind: call
    to: vrcnotifier.web.sdk
    label: {zh: "复用 SDK 客户端", en: "Reuse the SDK client"}
---
