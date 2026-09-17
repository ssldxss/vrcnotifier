---
uid: c857e08e
id: vrcnotifier.web.app.shell
parent: vrcnotifier.web.app
name: {zh: "外壳交互", en: "Shell Interactions"}
description:
  zh: >
      页签切换、主题、回到顶部这些外壳上的小事。
      
  en: >
      The small shell behaviours: switching tabs, themes, and back to top.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.925Z"
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
