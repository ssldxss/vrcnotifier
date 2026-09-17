---
uid: f690a2d4
id: vrcnotifier.infra.util.identity
parent: vrcnotifier.infra.util
name: {zh: "令牌加星号与信任等级", en: "Hiding Tokens & Trust Levels"}
description:
  zh: >
      把令牌加星号显示，并把信任标签换算成人能看懂的等级名。
      
  en: >
      Masks a token for display, and turns trust tags into a readable level name.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.266Z"
fingerprint: dad346d151126757bfecb58b1aa65eee4ff6241bcf1640ee751c8b7a54d6d9ca
source:
  - path: "src/util.js"
    line: 22
    end_line: 36
apis:
  - protocol: rpc
    path: "maskKey(token)"
    description:
      zh: >
          令牌加星号，仅保留前四后四位。
          
      en: >
          Mask a token keeping only its first and last four characters.
          
  - protocol: rpc
    path: "trustLevelFromTags(tags)"
    description:
      zh: >
          把 VRChat 信任标签映射为官方等级名。
          
      en: >
          Map VRChat trust tags to the official trust level name.
          
---
