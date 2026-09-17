---
uid: dc511f7d
id: vrcnotifier.web.app.friend-config
parent: vrcnotifier.web.app
name: {zh: "通知开关提交", en: "Saving Notification Switches"}
description:
  zh: >
      勾选通知开关时立即响应；保存失败再退回去。
  en: >
      Notification switches react immediately, and roll back if saving fails.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:19:37.674Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 1333
    end_line: 1364
apis:
  - protocol: rpc
    path: "onFriendConfigChange(e)"
    description:
      zh: >
          乐观应用配置变更，失败则回滚。
          
      en: >
          Optimistically apply a config change and roll back on failure.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.api-client
    label: {zh: "持久化开关", en: "Persist the toggle"}
  - kind: call
    to: vrcnotifier.web.app.roster
    label: {zh: "回滚好友缓存", en: "Roll back cached friends"}
---
