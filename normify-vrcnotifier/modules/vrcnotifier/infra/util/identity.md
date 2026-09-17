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
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.673Z"
fingerprint: d45be10322348d08689f4370017a56b85227e1051cb460ef6fd221c61535d6eb
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
