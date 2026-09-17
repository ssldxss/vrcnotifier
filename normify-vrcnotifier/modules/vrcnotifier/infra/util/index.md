---
uid: 6be72809
id: vrcnotifier.infra.util
parent: vrcnotifier.infra
name: {zh: "共享工具", en: "Shared Helpers"}
description:
  zh: >
      两个小工具：把令牌加星号显示，以及「等太久就先用旧值」。
      
  en: >
      Two small helpers: showing a token with most of it hidden, and falling back to an old value instead of waiting forever.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.673Z"
fingerprint: d45be10322348d08689f4370017a56b85227e1051cb460ef6fd221c61535d6eb
source:
  - path: "src/util.js"
deps:
  - kind: call
    to: vrcnotifier.infra.util.identity
    label: {zh: "加星号与信任等级", en: "Hiding tokens and trust"}
  - kind: call
    to: vrcnotifier.infra.util.deadline
    label: {zh: "超时兜底", en: "Promise deadline"}
---
