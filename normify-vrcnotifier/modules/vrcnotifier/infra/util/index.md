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
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:24:09.512Z"
fingerprint: dad346d151126757bfecb58b1aa65eee4ff6241bcf1640ee751c8b7a54d6d9ca
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
