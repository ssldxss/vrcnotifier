---
uid: c857e08e
id: vrcnotifier.web.app.shell
parent: vrcnotifier.web.app
name: {zh: "外壳交互", en: "Shell Interactions"}
description:
  zh: >
      让面板像应用而非网页的全部细节：带滑动指示块的页签导航、可点的概览卡片、主题切换与外链委托。
      
  en: >
      Everything that makes the panel feel like an application rather than a page: tab navigation with a sliding indicator, the clickable overview cards, the theme switch and the external-link delegation.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
deps:
  - kind: call
    to: vrcnotifier.web.app.shell.tabs
    label: {zh: "页签导航", en: "Tab navigation"}
  - kind: call
    to: vrcnotifier.web.app.shell.overview
    label: {zh: "概览卡片", en: "Overview cards"}
  - kind: call
    to: vrcnotifier.web.app.shell.theme
    label: {zh: "主题切换", en: "Theme switching"}
---
