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
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-17T00:14:27.119Z"
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
