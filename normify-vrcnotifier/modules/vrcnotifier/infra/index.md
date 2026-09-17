---
uid: 73b3ddc8
id: vrcnotifier.infra
parent: vrcnotifier
name: {zh: "基础设施", en: "Cross-cutting Infrastructure"}
description:
  zh: >
      各处都要用到的底层能力：日志、加密、头像缓存。
      
  en: >
      The low-level pieces everything else leans on: logging, encryption and the avatar cache.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.262Z"
fingerprint: d3259fdf646e2a782ef32f0faf0d1665902e7d44931d76121449baca01a41a69
source:
  - path: "src/util.js"
  - path: "src/crypto.js"
  - path: "src/filelog.js"
  - path: "src/logstream.js"
  - path: "src/avatar.js"
deps:
  - kind: call
    to: vrcnotifier.infra.logging
    label: {zh: "日志栈", en: "Logging stack"}
  - kind: call
    to: vrcnotifier.infra.crypto
    label: {zh: "数据加密", en: "Data encryption"}
  - kind: call
    to: vrcnotifier.infra.avatar
    label: {zh: "头像缓存", en: "Avatar cache"}
  - kind: call
    to: vrcnotifier.infra.util
    label: {zh: "共享工具", en: "Shared helpers"}
---
