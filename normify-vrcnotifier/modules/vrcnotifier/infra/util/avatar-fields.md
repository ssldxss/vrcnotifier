---
uid: "19655019"
id: vrcnotifier.infra.util.avatar-fields
parent: vrcnotifier.infra.util
tags: [avatar, contract]
name: {zh: "头像取值规则", en: "Avatar Source Rule"}
description:
  zh: >
      全项目唯一决定"取哪张头像"的地方：iconUrl 优先（好友 schema 唯一声明的头像字段，也是 REST 快照与 WS 事件唯一都有的），缺失时退回 currentAvatarImageUrl。已不再返回的两个缩略图字段刻意不读。
      
  en: >
      The one place that decides which avatar a user gets: iconUrl first (the only avatar field the friend schema declares, and the only one both the REST snapshot and the WS events carry), falling back to currentAvatarImageUrl. The two thumbnail fields VRChat stopped returning are deliberately not read.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:59:42.577Z"
fingerprint: dad346d151126757bfecb58b1aa65eee4ff6241bcf1640ee751c8b7a54d6d9ca
source:
  - path: "src/util.js"
    line: 51
    end_line: 54
apis:
  - protocol: rpc
    path: "avatarFields(u)"
    description:
      zh: >
          把 VRChat user 对象映射成本项目唯一的头像字段。
          
      en: >
          Map a VRChat user object onto this project's single avatar field.
          
---
