---
uid: 6be72809
id: vrcnotifier.infra.util
parent: vrcnotifier.infra
name: {zh: "共享工具", en: "Shared Helpers"}
description:
  zh: >
      两个被许多模块依赖的独立小工具：令牌打码与信任等级推导，以及提前用兜底值兑现而不拒绝的 promise 超时。
      
  en: >
      Two independent small helpers that many modules depend on: token masking with trust-level derivation, and a promise deadline that resolves early with a fallback instead of rejecting.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
fingerprint: d45be10322348d08689f4370017a56b85227e1051cb460ef6fd221c61535d6eb
source:
  - path: "src/util.js"
deps:
  - kind: call
    to: vrcnotifier.infra.util.identity
    label: {zh: "打码与信任等级", en: "Masking and trust"}
  - kind: call
    to: vrcnotifier.infra.util.deadline
    label: {zh: "超时兜底", en: "Promise deadline"}
---
