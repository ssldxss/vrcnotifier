---
uid: dc511f7d
id: vrcnotifier.web.app.friend-config
parent: vrcnotifier.web.app
name: {zh: "好友配置提交", en: "Friend Config Commit"}
description:
  zh: >
      提交逐好友开关。开关立即响应、请求在后台发出，因为先等一次往返再让复选框动起来会显得卡死；若服务端拒绝，则把开关与缓存的好友对象回滚到旧值并提示错误。整个列表使用一个委托监听器，而不是每行一个处理函数。
      
  en: >
      Committing a per-friend toggle. The switch flips immediately and the request is sent in the background, because waiting for a round trip before showing a checkbox move feels broken; if the server rejects, the switch and the cached friend object are rolled back to their previous values and the error is surfaced. A single delegated listener handles the whole list rather than one handler per row.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
