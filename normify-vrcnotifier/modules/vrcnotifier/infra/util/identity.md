---
uid: f690a2d4
id: vrcnotifier.infra.util.identity
parent: vrcnotifier.infra.util
name: {zh: "令牌打码与信任等级", en: "Token Masking & Trust Levels"}
description:
  zh: >
      打码刻意做到既安全又有用：较长的令牌保留前四后四位，使运维能确认当前用的是哪一个；短到这种展示就会泄露的令牌则整体打码。信任等级推导按固定优先级把平台标签集收敛为五个官方等级名，使展示与存储使用同一套词汇。
      
  en: >
      Masking is deliberately lossy enough to be safe and informative enough to be useful: a long token keeps its first and last four characters so an operator can confirm which token is in play, while anything short enough for that to be revealing is masked entirely. Trust level derivation collapses the platform's tag set into the five official level names by fixed priority, so display and storage agree on the vocabulary.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:30.745Z"
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
          令牌打码，仅保留前四后四位。
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
