---
uid: c38b6c41
id: vrcnotifier.web.app.roster
parent: vrcnotifier.web.app
name: {zh: "好友数据与渲染", en: "Friend Data & Rendering"}
description:
  zh: >
      好友列表的数据，以及每一行显示什么。
      
  en: >
      The friend list's data, and what each row shows.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.304Z"
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
