---
uid: 73b3ddc8
id: vrcnotifier.infra
parent: vrcnotifier
name: {zh: "基础设施", en: "Cross-cutting Infrastructure"}
description:
  zh: >
      不含领域知识的横切基础设施：三层日志栈（日志器、内存环、分段文件）、带密钥解析的 AES-256-GCM 字段加密、磁盘头像缓存，以及若干共享小工具。
      
  en: >
      Cross-cutting infrastructure with no domain knowledge: the three-layer logging stack (logger, in-memory ring, segmented files), AES-256-GCM field encryption with its key resolution, the on-disk avatar cache, and the small shared helpers.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
fingerprint: 0fcc26c5970d1e8b6046e59aff9cb6b810812fbd7eff0a01b9f15a551e8ec67f
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
