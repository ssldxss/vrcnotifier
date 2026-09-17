---
uid: 2d186ba7
id: vrcnotifier.web.app.groups
parent: vrcnotifier.web.app
name: {zh: "好友分组与搜索", en: "Friend Groups & Search"}
description:
  zh: >
      把好友分成特别关注、在线、离线几组，并支持搜索。
      
  en: >
      Groups friends into favorites, online and offline, with a search box.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.922Z"
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
    label: {zh: "渲染好友行", en: "Render friend rows"}
  - kind: call
    to: vrcnotifier.web.vrclinks
    label: {zh: "构造深链", en: "Build deep links"}
---
