---
uid: 2d186ba7
id: vrcnotifier.web.app.groups
parent: vrcnotifier.web.app
name: {zh: "好友分组与搜索", en: "Friend Groups & Search"}
description:
  zh: >
      把名册分成若干区块，特别关注提升到最前，离线分组默认折叠，并把搜索框作为跨昵称、世界与状态的筛选器。折叠状态会持久化，使面板回到用户离开时的样子；搜索交互做了去抖，否则在好友很多时每敲一个键就整表重绘会明显卡顿。
      
  en: >
      Groups the roster into sections with favorites promoted to the top and offline collapsed by default, applying the search box as a filter across names, worlds and statuses. Collapse state persists so the panel comes back the way the user left it, and the search interaction is debounced because re-rendering the whole list on every keystroke would be visibly janky with a large friend list.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:27.989Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 1039
    end_line: 1141
apis:
  - protocol: rpc
    path: "renderFriends()"
    description:
      zh: >
          渲染分组与筛选后的好友列表。
          
      en: >
          Render the grouped, filtered friend list.
          
  - protocol: rpc
    path: "groupCollapsedState()"
    description:
      zh: >
          持久化并恢复各分组的折叠状态。
          
      en: >
          Persist and restore per-group collapsed state.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.roster
    from_api: "rpc:renderFriends()"
    to_api: "rpc:personParts(p)"
    label: {zh: "渲染好友行", en: "Render friend rows"}
  - kind: call
    to: vrcnotifier.web.vrclinks
    from_api: "rpc:renderFriends()"
    to_api: "rpc:linkHtml(kind, id, text)"
    label: {zh: "构造深链", en: "Build deep links"}
---
