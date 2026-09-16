---
uid: c38b6c41
id: vrcnotifier.web.app.roster
parent: vrcnotifier.web.app
name: {zh: "好友数据与渲染", en: "Friend Data & Rendering"}
description:
  zh: >
      好友数据加载与逐人渲染片段。世界名比名册晚到，因为它是按需解析的，因此本模块还负责定点更新：世界名事件到达时，把名字补进正在展示该世界的那几行——列表从不为了等名字而阻塞，也不会为了显示一个名字而整表重绘。
      
  en: >
      Friend data loading and the per-person rendering pieces. World names arrive later than the roster because they are resolved on demand, so this module also owns the targeted update that patches a name into the rows showing that world when the world-name event arrives — the list is never blocked waiting for names, and never redrawn wholesale to show one.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 969
    end_line: 1037
apis:
  - protocol: rpc
    path: "loadFriends()"
    description:
      zh: >
          拉取好友列表与当前用户。
          
      en: >
          Fetch the friend list and current user.
          
  - protocol: rpc
    path: "personParts(p)"
    description:
      zh: >
          拼装单个好友的头像、名称、世界与状态。
          
      en: >
          Compose avatar, name, world and status for one friend.
          
  - protocol: rpc
    path: "applyWorldName(worldId, worldName)"
    description:
      zh: >
          把异步解析到的世界名应用到对应行。
          
      en: >
          Apply an asynchronously resolved world name to the matching rows.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.api-client
    label: {zh: "拉取好友", en: "Fetch friends"}
  - kind: call
    to: vrcnotifier.web.vrclinks
    label: {zh: "构造深链", en: "Build deep links"}
---
